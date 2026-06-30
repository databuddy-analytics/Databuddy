import { db, eq } from "@databuddy/db";
import { uptimeSchedules } from "@databuddy/db/schema";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import {
	enqueueUptimeCheck,
	removeUptimeSchedule,
	upsertUptimeSchedule,
	type UptimeGranularity,
} from "./uptime-scheduler";

type UptimeScheduleInsert = typeof uptimeSchedules.$inferInsert;
type UptimeScheduleRow = typeof uptimeSchedules.$inferSelect;

export interface UptimeScheduleUpdate {
	cacheBust?: boolean;
	cron?: string;
	granularity?: UptimeGranularity;
	jsonParsingConfig?: { enabled: boolean };
	name?: string | null;
	timeout?: number | null;
	updatedAt: Date;
}

export type UptimeScheduleSnapshot = Pick<
	UptimeScheduleRow,
	| "cacheBust"
	| "cron"
	| "granularity"
	| "jsonParsingConfig"
	| "name"
	| "timeout"
>;

export interface UptimeLifecycleDeps {
	now: () => Date;
	removeScheduler: (scheduleId: string) => Promise<void>;
	store: {
		delete: (scheduleId: string) => Promise<void>;
		insert: (values: UptimeScheduleInsert) => Promise<void>;
		update: (
			scheduleId: string,
			values: Partial<UptimeScheduleRow> | UptimeScheduleUpdate
		) => Promise<void>;
	};
	upsertScheduler: (
		scheduleId: string,
		granularity: UptimeGranularity
	) => Promise<void>;
}

export interface ManualCheckDeps {
	enqueueCheck: (scheduleId: string) => Promise<void>;
	rateLimit: (scheduleId: string) => Promise<{ success: boolean }>;
}

const uptimeLifecycleDeps: UptimeLifecycleDeps = {
	now: () => new Date(),
	removeScheduler: removeUptimeSchedule,
	upsertScheduler: upsertUptimeSchedule,
	store: {
		delete: async (scheduleId) => {
			await db
				.delete(uptimeSchedules)
				.where(eq(uptimeSchedules.id, scheduleId));
		},
		insert: async (values) => {
			await db.insert(uptimeSchedules).values(values);
		},
		update: async (scheduleId, values) => {
			await db
				.update(uptimeSchedules)
				.set(values)
				.where(eq(uptimeSchedules.id, scheduleId));
		},
	},
};

const manualCheckDeps: ManualCheckDeps = {
	enqueueCheck: enqueueUptimeCheck,
	rateLimit: (scheduleId) => ratelimit(`manual-check:${scheduleId}`, 5, 60),
};

export async function createScheduleWithScheduler(
	values: UptimeScheduleInsert & { id: string; granularity: UptimeGranularity },
	deps: UptimeLifecycleDeps = uptimeLifecycleDeps
): Promise<void> {
	await deps.store.insert(values);

	try {
		await deps.upsertScheduler(values.id, values.granularity);
	} catch (error) {
		logger.error(
			{ scheduleId: values.id, error },
			"BullMQ failed, cleaning up"
		);
		await deps
			.removeScheduler(values.id)
			.catch((cleanupError) =>
				logger.error(
					{ scheduleId: values.id, error: cleanupError },
					"Failed to clean up uptime scheduler after BullMQ failure"
				)
			);
		await deps.store
			.delete(values.id)
			.catch((cleanupError) =>
				logger.error(
					{ scheduleId: values.id, error: cleanupError },
					"Failed to clean up monitor after BullMQ failure"
				)
			);
		throw rpcError.internal("Failed to create monitor");
	}
}

export async function deleteScheduleWithScheduler(
	scheduleId: string,
	deps: UptimeLifecycleDeps = uptimeLifecycleDeps
): Promise<void> {
	await deps.store.delete(scheduleId);
	await deps
		.removeScheduler(scheduleId)
		.catch((error) =>
			logger.warn(
				{ scheduleId, error },
				"Failed to remove uptime scheduler after deleting monitor"
			)
		);
}

export async function updateScheduleWithScheduler(
	scheduleId: string,
	values: UptimeScheduleUpdate,
	previous: UptimeScheduleSnapshot,
	deps: UptimeLifecycleDeps = uptimeLifecycleDeps
): Promise<void> {
	await deps.store.update(scheduleId, values);

	if (!values.granularity) {
		return;
	}

	try {
		await deps.upsertScheduler(scheduleId, values.granularity);
	} catch (error) {
		logger.error(
			{ scheduleId, error },
			"Failed to update uptime scheduler, rolling back monitor granularity"
		);
		await deps.store
			.update(scheduleId, {
				name: previous.name,
				granularity: previous.granularity,
				cron: previous.cron,
				timeout: previous.timeout,
				cacheBust: previous.cacheBust,
				jsonParsingConfig: previous.jsonParsingConfig,
				updatedAt: deps.now(),
			})
			.catch((rollbackError) =>
				logger.error(
					{ scheduleId, error: rollbackError },
					"Failed to roll back monitor granularity after scheduler update failure"
				)
			);
		throw rpcError.internal("Failed to update monitor schedule");
	}
}

export async function pauseScheduleWithScheduler(
	scheduleId: string,
	deps: UptimeLifecycleDeps = uptimeLifecycleDeps
): Promise<void> {
	await deps.store.update(scheduleId, {
		isPaused: true,
		updatedAt: deps.now(),
	});
	await deps.removeScheduler(scheduleId);
}

export async function resumeScheduleWithScheduler(
	scheduleId: string,
	granularity: UptimeGranularity,
	deps: UptimeLifecycleDeps = uptimeLifecycleDeps
): Promise<void> {
	await deps.upsertScheduler(scheduleId, granularity);
	await deps.store.update(scheduleId, {
		isPaused: false,
		updatedAt: deps.now(),
	});
}

export async function triggerManualUptimeCheck(
	scheduleId: string,
	isPaused: boolean,
	deps: ManualCheckDeps = manualCheckDeps
): Promise<void> {
	if (isPaused) {
		throw rpcError.badRequest("Cannot trigger check on a paused monitor");
	}

	const rateLimit = await deps.rateLimit(scheduleId);
	if (!rateLimit.success) {
		throw rpcError.rateLimited(60);
	}

	try {
		await deps.enqueueCheck(scheduleId);
	} catch (error) {
		logger.error({ scheduleId, error }, "Manual check failed");
		throw rpcError.internal("Failed to trigger check");
	}
}
