import {
	and,
	asc,
	db,
	desc,
	eq,
	gte,
	inArray,
	isNull,
	lte,
} from "@databuddy/db";
import { insightGenerationConfigs, insightRuns } from "@databuddy/db/schema";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { queueInsightGenerationRun } from "@databuddy/rpc/insight-generation";
import {
	getNextInsightRunAt,
	normalizeInsightScheduleFrequency,
} from "@databuddy/rpc/insight-schedule";
import {
	getInsightsQueue,
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
} from "@databuddy/redis";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";
import { getInsightsMaintenanceIntervalMs } from "./recovery";

const DEFAULT_DISPATCH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_DISPATCH_INTERVAL_MS = 60 * 1000;
const MAX_DUE_CONFIGS_PER_TICK = 100;
const FAILED_DISPATCH_RETRY_MS = 60 * 1000;
const DISPATCH_CLAIM_LEASE_MS = 5 * 60 * 1000;

type DueConfig = typeof insightGenerationConfigs.$inferSelect;

export interface DispatchDueInsightRunsResult {
	claimedConfigs: number;
	dispatchedRuns: number;
	queuedItems: number;
	scannedConfigs: number;
	skippedConfigs: number;
}

function dispatchIntervalMs(): number {
	const raw = process.env.INSIGHTS_DISPATCH_INTERVAL_MS;
	if (!raw) {
		return DEFAULT_DISPATCH_INTERVAL_MS;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isSafeInteger(parsed) || parsed < MIN_DISPATCH_INTERVAL_MS) {
		return DEFAULT_DISPATCH_INTERVAL_MS;
	}
	return parsed;
}

export function isScheduledDispatchEnabled(): boolean {
	const organizations = scheduledDispatchOrganizations();
	return organizations === null || organizations.length > 0;
}

export function isScheduledDispatchActive(workerEnabled: boolean): boolean {
	return workerEnabled && isScheduledDispatchEnabled();
}

/** `null` means every enabled organization; an empty list means disabled. */
export function scheduledDispatchOrganizations(): string[] | null {
	if (!readBooleanEnv("INSIGHTS_SCHEDULED_DISPATCH_ENABLED")) {
		return [];
	}
	const raw = process.env.INSIGHTS_SCHEDULED_ORGANIZATION_IDS?.trim();
	if (raw === "*") {
		return null;
	}
	return [
		...new Set(
			(raw ?? "")
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean)
		),
	];
}

function nextRunAtFor(config: DueConfig, from: Date): Date | null {
	return getNextInsightRunAt(
		{
			enabled: config.enabled,
			frequency: normalizeInsightScheduleFrequency(config.frequency),
			timezone: config.timezone,
		},
		from
	);
}

async function dueConfigs(
	now: Date,
	organizationIds?: readonly string[]
): Promise<DueConfig[]> {
	if (organizationIds && organizationIds.length === 0) {
		return [];
	}
	const conditions = [
		eq(insightGenerationConfigs.enabled, true),
		lte(insightGenerationConfigs.nextRunAt, now),
	];
	if (organizationIds) {
		conditions.push(
			inArray(insightGenerationConfigs.organizationId, [...organizationIds])
		);
	}
	return await db
		.select()
		.from(insightGenerationConfigs)
		.where(and(...conditions))
		.orderBy(asc(insightGenerationConfigs.nextRunAt))
		.limit(MAX_DUE_CONFIGS_PER_TICK);
}

export async function claimDueConfig(
	config: DueConfig,
	now: Date
): Promise<DueConfig | null> {
	if (!config.nextRunAt) {
		return null;
	}
	const [claimed] = await db
		.update(insightGenerationConfigs)
		.set({
			dispatchDueAt: config.dispatchDueAt ?? config.nextRunAt,
			nextRunAt: new Date(now.getTime() + DISPATCH_CLAIM_LEASE_MS),
			updatedAt: now,
		})
		.where(
			and(
				eq(insightGenerationConfigs.id, config.id),
				eq(insightGenerationConfigs.enabled, true),
				eq(insightGenerationConfigs.nextRunAt, config.nextRunAt),
				eq(insightGenerationConfigs.updatedAt, config.updatedAt)
			)
		)
		.returning();

	return claimed ?? null;
}

async function markConfigDispatched(
	config: DueConfig,
	lastRunAt: Date,
	now: Date
): Promise<boolean> {
	if (!config.nextRunAt) {
		return false;
	}
	const updated = await db
		.update(insightGenerationConfigs)
		.set({
			dispatchDueAt: null,
			lastRunAt,
			nextRunAt: nextRunAtFor(config, now),
			updatedAt: now,
		})
		.where(
			and(
				eq(insightGenerationConfigs.id, config.id),
				eq(insightGenerationConfigs.enabled, true),
				eq(insightGenerationConfigs.nextRunAt, config.nextRunAt),
				eq(insightGenerationConfigs.updatedAt, config.updatedAt),
				config.dispatchDueAt
					? eq(insightGenerationConfigs.dispatchDueAt, config.dispatchDueAt)
					: isNull(insightGenerationConfigs.dispatchDueAt)
			)
		)
		.returning({ id: insightGenerationConfigs.id });
	return updated.length === 1;
}

async function durableScheduledRunAfter(
	organizationId: string,
	dueAt: Date
): Promise<{ createdAt: Date; id: string } | null> {
	const [run] = await db
		.select({ createdAt: insightRuns.createdAt, id: insightRuns.id })
		.from(insightRuns)
		.where(
			and(
				eq(insightRuns.organizationId, organizationId),
				eq(insightRuns.reason, "scheduled"),
				gte(insightRuns.createdAt, dueAt),
				inArray(insightRuns.status, [
					"queued",
					"running",
					"succeeded",
					"partially_succeeded",
					"skipped",
				])
			)
		)
		.orderBy(desc(insightRuns.createdAt))
		.limit(1);
	return run ?? null;
}

export async function retryConfigSoon(
	config: DueConfig,
	now: Date
): Promise<void> {
	if (!config.nextRunAt) {
		return;
	}
	await db
		.update(insightGenerationConfigs)
		.set({
			nextRunAt: new Date(now.getTime() + FAILED_DISPATCH_RETRY_MS),
			updatedAt: now,
		})
		.where(
			and(
				eq(insightGenerationConfigs.id, config.id),
				eq(insightGenerationConfigs.enabled, true),
				eq(insightGenerationConfigs.nextRunAt, config.nextRunAt),
				eq(insightGenerationConfigs.updatedAt, config.updatedAt)
			)
		);
}

export async function ensureInsightsDispatchSchedule(): Promise<void> {
	if (!isScheduledDispatchEnabled()) {
		const removed = await getInsightsQueue().removeJobScheduler(
			INSIGHTS_DISPATCH_JOB_NAME
		);
		emitInsightsEvent("info", "scheduler.dispatch_disabled", {
			removed_existing_schedule: removed,
		});
		return;
	}

	const intervalMs = dispatchIntervalMs();
	await getInsightsQueue().upsertJobScheduler(
		INSIGHTS_DISPATCH_JOB_NAME,
		{ every: intervalMs },
		{
			name: INSIGHTS_DISPATCH_JOB_NAME,
			data: {
				reason: "scheduled",
				triggeredAt: new Date().toISOString(),
			},
		}
	);

	emitInsightsEvent("info", "scheduler.dispatch_ensured", {
		interval_ms: intervalMs,
	});
}

export async function ensureInsightsMaintenanceSchedule(): Promise<void> {
	const intervalMs = getInsightsMaintenanceIntervalMs();
	await getInsightsQueue().upsertJobScheduler(
		INSIGHTS_MAINTENANCE_JOB_NAME,
		{ every: intervalMs },
		{
			name: INSIGHTS_MAINTENANCE_JOB_NAME,
			data: {
				reason: "maintenance",
				triggeredAt: new Date().toISOString(),
			},
		}
	);

	emitInsightsEvent("info", "scheduler.maintenance_ensured", {
		interval_ms: intervalMs,
	});
}

export async function removeInsightsSchedules(): Promise<void> {
	const queue = getInsightsQueue();
	const [dispatchRemoved, maintenanceRemoved] = await Promise.all([
		queue.removeJobScheduler(INSIGHTS_DISPATCH_JOB_NAME),
		queue.removeJobScheduler(INSIGHTS_MAINTENANCE_JOB_NAME),
	]);
	emitInsightsEvent("info", "scheduler.schedules_removed", {
		dispatch_removed: dispatchRemoved,
		maintenance_removed: maintenanceRemoved,
	});
}

export async function dispatchDueInsightRuns(
	now = new Date(),
	organizationIds?: readonly string[]
): Promise<DispatchDueInsightRunsResult> {
	const startedAt = performance.now();
	const configs = await dueConfigs(now, organizationIds);
	const result: DispatchDueInsightRunsResult = {
		scannedConfigs: configs.length,
		claimedConfigs: 0,
		dispatchedRuns: 0,
		queuedItems: 0,
		skippedConfigs: 0,
	};

	for (const config of configs) {
		const claimed = await claimDueConfig(config, now);
		if (!claimed) {
			result.skippedConfigs += 1;
			continue;
		}
		result.claimedConfigs += 1;

		try {
			const durableRun = claimed.dispatchDueAt
				? await durableScheduledRunAfter(
						claimed.organizationId,
						claimed.dispatchDueAt
					)
				: null;
			if (durableRun) {
				await markConfigDispatched(claimed, durableRun.createdAt, now);
				result.skippedConfigs += 1;
				emitInsightsEvent("warn", "scheduler.dispatch_receipt_recovered", {
					config_id: claimed.id,
					organization_id: claimed.organizationId,
					run_id: durableRun.id,
				});
				continue;
			}
			const queued = await queueInsightGenerationRun({
				organizationId: claimed.organizationId,
				reason: "scheduled",
			});
			if (queued.reusedRun) {
				const reusedScheduledRun = queued.runId
					? await durableScheduledRunAfter(
							claimed.organizationId,
							claimed.dispatchDueAt ?? now
						)
					: null;
				if (reusedScheduledRun) {
					await markConfigDispatched(
						claimed,
						reusedScheduledRun.createdAt,
						now
					);
				} else {
					await retryConfigSoon(claimed, now);
				}
				result.skippedConfigs += 1;
				emitInsightsEvent("warn", "scheduler.config_skipped_active_run", {
					config_id: claimed.id,
					organization_id: claimed.organizationId,
					run_id: queued.runId,
				});
				continue;
			}
			if (queued.status !== "disabled") {
				await markConfigDispatched(claimed, now, now);
			}
			if (queued.status !== "queued") {
				result.skippedConfigs += 1;
				emitInsightsEvent("warn", "scheduler.config_skipped", {
					config_id: claimed.id,
					organization_id: claimed.organizationId,
					status: queued.status,
				});
				continue;
			}
			result.dispatchedRuns += 1;
			result.queuedItems += queued.queuedItems;
			emitInsightsEvent("info", "scheduler.config_dispatched", {
				config_id: claimed.id,
				organization_id: claimed.organizationId,
				queued_items: queued.queuedItems,
				run_id: queued.runId,
			});
		} catch (error) {
			await retryConfigSoon(claimed, now);
			result.skippedConfigs += 1;
			captureInsightsError(error, "scheduler.config_dispatch_failed", {
				config_id: claimed.id,
				organization_id: claimed.organizationId,
			});
		}
	}

	emitInsightsEvent("info", "scheduler.dispatch_tick.completed", {
		duration_ms: Math.round(performance.now() - startedAt),
		scanned_configs: result.scannedConfigs,
		claimed_configs: result.claimedConfigs,
		dispatched_runs: result.dispatchedRuns,
		queued_items: result.queuedItems,
		skipped_configs: result.skippedConfigs,
	});

	return result;
}
