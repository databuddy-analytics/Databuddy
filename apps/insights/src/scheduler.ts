import { and, asc, db, eq, lte } from "@databuddy/db";
import { insightGenerationConfigs } from "@databuddy/db/schema";
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

const DISPATCH_INTERVAL_MS = 5 * 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DUE_CONFIGS_PER_TICK = 100;
const FAILED_DISPATCH_RETRY_MS = 60 * 1000;

type DueConfig = typeof insightGenerationConfigs.$inferSelect;

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

async function dueConfigs(now: Date): Promise<DueConfig[]> {
	return await db
		.select()
		.from(insightGenerationConfigs)
		.where(
			and(
				eq(insightGenerationConfigs.enabled, true),
				lte(insightGenerationConfigs.nextRunAt, now)
			)
		)
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
			frequency: normalizeInsightScheduleFrequency(config.frequency),
			nextRunAt: nextRunAtFor(config, now),
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

export async function retryConfigSoon(
	config: Pick<DueConfig, "id" | "nextRunAt" | "updatedAt">,
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
	await getInsightsQueue().upsertJobScheduler(
		INSIGHTS_DISPATCH_JOB_NAME,
		{ every: DISPATCH_INTERVAL_MS },
		{
			name: INSIGHTS_DISPATCH_JOB_NAME,
			data: {
				reason: "scheduled",
				triggeredAt: new Date().toISOString(),
			},
		}
	);

	emitInsightsEvent("info", "scheduler.dispatch_ensured", {
		interval_ms: DISPATCH_INTERVAL_MS,
	});
}

export async function ensureInsightsMaintenanceSchedule(): Promise<void> {
	await getInsightsQueue().upsertJobScheduler(
		INSIGHTS_MAINTENANCE_JOB_NAME,
		{ every: MAINTENANCE_INTERVAL_MS },
		{
			name: INSIGHTS_MAINTENANCE_JOB_NAME,
			data: {
				reason: "maintenance",
				triggeredAt: new Date().toISOString(),
			},
		}
	);

	emitInsightsEvent("info", "scheduler.maintenance_ensured", {
		interval_ms: MAINTENANCE_INTERVAL_MS,
	});
}

export async function dispatchDueInsightRuns(now = new Date()) {
	const startedAt = performance.now();
	const configs = await dueConfigs(now);
	const result = {
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
			const queued = await queueInsightGenerationRun({
				organizationId: claimed.organizationId,
				reason: "scheduled",
			});
			if (queued.reusedRun) {
				await retryConfigSoon(claimed, now);
				result.skippedConfigs += 1;
				emitInsightsEvent("warn", "scheduler.config_skipped_active_run", {
					config_id: claimed.id,
					organization_id: claimed.organizationId,
					run_id: queued.runId,
				});
				continue;
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
