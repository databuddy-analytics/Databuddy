import { and, asc, db, eq, inArray, lt } from "@databuddy/db";
import {
	insightRunItems,
	insightRuns,
	type InsightRun,
	type InsightRunItem,
	type InsightRunStatus,
} from "@databuddy/db/schema";
import {
	getInsightsQueue,
	INSIGHTS_JOB_TIMEOUT_MS,
	INSIGHTS_ROLLUP_JOB_NAME,
	insightsRollupJobId,
} from "@databuddy/redis";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";

const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_MAINTENANCE_INTERVAL_MS = 60 * 1000;
const DEFAULT_STALE_ITEM_MS = Math.max(
	15 * 60 * 1000,
	INSIGHTS_JOB_TIMEOUT_MS * 4
);
const MIN_STALE_ITEM_MS = INSIGHTS_JOB_TIMEOUT_MS * 2;
const MAX_STALE_ITEMS_PER_SWEEP = 100;
const MAX_STALE_RUNS_PER_SWEEP = 100;

const ACTIVE_QUEUE_STATES = new Set([
	"active",
	"delayed",
	"prioritized",
	"waiting",
	"waiting-children",
]);

type RecoverableItem = Pick<
	InsightRunItem,
	"id" | "queueJobId" | "runId" | "status"
>;

interface RunStatusSummary {
	completedItems: number;
	failedItems: number;
	queuedItems: number;
	run: InsightRun | null;
	runningItems: number;
	settled: boolean;
	skippedItems: number;
	status: InsightRunStatus;
	totalItems: number;
}

export interface InsightRecoveryResult {
	failedItems: number;
	keptItems: number;
	scannedItems: number;
	scannedRuns: number;
	syncedRuns: number;
}

function parseDurationMs(
	value: string | undefined,
	fallback: number,
	min: number
): number {
	if (value === undefined || value.trim() === "") {
		return fallback;
	}
	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed) || parsed < min) {
		return fallback;
	}
	return parsed;
}

export function getInsightsMaintenanceIntervalMs(
	value = process.env.INSIGHTS_MAINTENANCE_INTERVAL_MS
): number {
	return parseDurationMs(
		value,
		DEFAULT_MAINTENANCE_INTERVAL_MS,
		MIN_MAINTENANCE_INTERVAL_MS
	);
}

export function getInsightsStaleItemMs(
	value = process.env.INSIGHTS_STALE_ITEM_MS
): number {
	return parseDurationMs(value, DEFAULT_STALE_ITEM_MS, MIN_STALE_ITEM_MS);
}

async function staleItemFailureReason(
	item: RecoverableItem
): Promise<string | null> {
	if (!item.queueJobId) {
		return "Insight queue job id is missing after stale timeout";
	}

	const job = await getInsightsQueue().getJob(item.queueJobId);
	if (!job) {
		return "Insight queue job is missing after stale timeout";
	}

	const state = await job.getState();
	if (ACTIVE_QUEUE_STATES.has(state)) {
		return null;
	}
	return `Insight queue job is ${state} but the database item is still ${item.status}`;
}

async function staleItems(cutoff: Date): Promise<RecoverableItem[]> {
	return await db
		.select({
			id: insightRunItems.id,
			queueJobId: insightRunItems.queueJobId,
			runId: insightRunItems.runId,
			status: insightRunItems.status,
		})
		.from(insightRunItems)
		.where(
			and(
				inArray(insightRunItems.status, ["queued", "running"]),
				lt(insightRunItems.updatedAt, cutoff)
			)
		)
		.orderBy(asc(insightRunItems.updatedAt))
		.limit(MAX_STALE_ITEMS_PER_SWEEP);
}

async function staleRunIds(cutoff: Date): Promise<string[]> {
	const rows = await db
		.select({ id: insightRuns.id })
		.from(insightRuns)
		.where(
			and(
				inArray(insightRuns.status, ["queued", "running"]),
				lt(insightRuns.updatedAt, cutoff)
			)
		)
		.orderBy(asc(insightRuns.updatedAt))
		.limit(MAX_STALE_RUNS_PER_SWEEP);

	return rows.map((row) => row.id);
}

export function summarizeItemErrors(
	items: Pick<InsightRunItem, "errorMessage" | "status">[]
): string | null {
	const counts = new Map<string, number>();
	for (const item of items) {
		if (item.status === "failed" && item.errorMessage) {
			counts.set(item.errorMessage, (counts.get(item.errorMessage) ?? 0) + 1);
		}
	}

	let topMessage: string | null = null;
	let topCount = 0;
	for (const [message, count] of counts) {
		if (count > topCount) {
			topMessage = message;
			topCount = count;
		}
	}
	if (!topMessage) {
		return null;
	}

	const otherTypes = counts.size - 1;
	const suffix = otherTypes > 0 ? ` (+${otherTypes} other error types)` : "";
	return `${topCount} item${topCount === 1 ? "" : "s"}: ${topMessage}${suffix}`;
}

export async function syncRunStatus(runId: string): Promise<RunStatusSummary> {
	const [run, items] = await Promise.all([
		db.query.insightRuns.findFirst({ where: { id: runId } }),
		db
			.select({
				errorMessage: insightRunItems.errorMessage,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.runId, runId)),
	]);

	const completedItems = items.filter(
		(item) => item.status === "succeeded"
	).length;
	const failedItems = items.filter((item) => item.status === "failed").length;
	const queuedItems = items.filter((item) => item.status === "queued").length;
	const runningItems = items.filter((item) => item.status === "running").length;
	const skippedItems = items.filter((item) => item.status === "skipped").length;
	const settledItems = completedItems + failedItems + skippedItems;
	const totalItems = items.length;
	const settled = settledItems === totalItems;

	let status: InsightRunStatus =
		queuedItems === totalItems ? "queued" : "running";
	if (totalItems === 0) {
		status = "skipped";
	} else if (settled) {
		if (completedItems > 0 && failedItems === 0) {
			status = "succeeded";
		} else if (completedItems > 0) {
			status = "partially_succeeded";
		} else if (skippedItems === totalItems) {
			status = "skipped";
		} else {
			status = "failed";
		}
	}

	const now = new Date();
	await db
		.update(insightRuns)
		.set({
			completedItems,
			failedItems,
			skippedItems,
			status,
			updatedAt: now,
			...(settled ? { finishedAt: now } : {}),
			...(settled && failedItems > 0
				? { errorMessage: summarizeItemErrors(items) }
				: {}),
		})
		.where(eq(insightRuns.id, runId));

	setInsightsLog({
		run_status: status,
		run_total_items: totalItems,
		run_completed_items: completedItems,
		run_failed_items: failedItems,
		run_queued_items: queuedItems,
		run_running_items: runningItems,
		run_skipped_items: skippedItems,
		run_settled: settled,
	});

	return {
		completedItems,
		failedItems,
		queuedItems,
		run: run ?? null,
		runningItems,
		settled,
		skippedItems,
		status,
		totalItems,
	};
}

export async function queueRollupIfSettled(
	summary: RunStatusSummary
): Promise<void> {
	if (!(summary.run && summary.settled && summary.completedItems > 0)) {
		return;
	}
	if (
		summary.status !== "succeeded" &&
		summary.status !== "partially_succeeded"
	) {
		return;
	}

	try {
		await getInsightsQueue().add(
			INSIGHTS_ROLLUP_JOB_NAME,
			{
				organizationId: summary.run.organizationId,
				reason: summary.run.reason,
				runId: summary.run.id,
				timezone: summary.run.timezone,
			},
			{ jobId: insightsRollupJobId(summary.run.id) }
		);
		emitInsightsEvent("info", "recovery.rollup_queued", {
			run_id: summary.run.id,
			organization_id: summary.run.organizationId,
			run_status: summary.status,
			completed_items: summary.completedItems,
		});
	} catch (error) {
		captureInsightsError(error, "recovery.rollup_queue_failed", {
			run_id: summary.run.id,
			organization_id: summary.run.organizationId,
		});
	}
}

export async function recoverStaleInsightRuns(
	now = new Date()
): Promise<InsightRecoveryResult> {
	const startedAt = performance.now();
	const cutoff = new Date(now.getTime() - getInsightsStaleItemMs());
	const items = await staleItems(cutoff);
	const affectedRunIds = new Set<string>();
	let failedItems = 0;
	let keptItems = 0;

	for (const item of items) {
		const reason = await staleItemFailureReason(item);
		if (!reason) {
			keptItems += 1;
			continue;
		}

		await db
			.update(insightRunItems)
			.set({
				errorMessage: reason,
				finishedAt: now,
				status: "failed",
				updatedAt: now,
			})
			.where(eq(insightRunItems.id, item.id));
		affectedRunIds.add(item.runId);
		failedItems += 1;
		emitInsightsEvent("warn", "recovery.stale_item_failed", {
			item_id: item.id,
			queue_job_id: item.queueJobId,
			run_id: item.runId,
			previous_status: item.status,
			reason,
		});
	}

	const runIds = new Set([...affectedRunIds, ...(await staleRunIds(cutoff))]);

	for (const runId of runIds) {
		const summary = await syncRunStatus(runId);
		await queueRollupIfSettled(summary);
	}

	emitInsightsEvent("info", "recovery.sweep_completed", {
		duration_ms: Math.round(performance.now() - startedAt),
		failed_items: failedItems,
		kept_items: keptItems,
		scanned_items: items.length,
		synced_runs: runIds.size,
	});

	return {
		failedItems,
		keptItems,
		scannedItems: items.length,
		scannedRuns: runIds.size,
		syncedRuns: runIds.size,
	};
}
