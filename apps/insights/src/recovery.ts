import {
	and,
	asc,
	db,
	eq,
	inArray,
	isNotNull,
	isNull,
	lt,
	ne,
	notExists,
	or,
	sql,
} from "@databuddy/db";
import {
	insightRunEffects,
	insightRunItems,
	insightRollups,
	insightRuns,
	type InsightRun,
	type InsightRunItem,
	type InsightRunStatus,
} from "@databuddy/db/schema";
import {
	getInsightsQueue,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_JOB_TIMEOUT_MS,
	INSIGHTS_ROLLUP_JOB_NAME,
	insightsWebsiteJobId,
	insightsRollupJobId,
} from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import {
	captureInsightsError,
	emitInsightsEvent,
	setInsightsLog,
} from "./lib/evlog-insights";
import { loadCompletedPreparedResult } from "./effects";

const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_MAINTENANCE_INTERVAL_MS = 60 * 1000;
const DEFAULT_STALE_ITEM_MS = Math.max(
	15 * 60 * 1000,
	INSIGHTS_JOB_TIMEOUT_MS * 4
);
const MIN_STALE_ITEM_MS = INSIGHTS_JOB_TIMEOUT_MS * 2;
const MAX_STALE_ITEMS_PER_SWEEP = 100;
const MAX_STALE_RUNS_PER_SWEEP = 100;
const ROLLUP_RANGE_COUNT = 3;

const ACTIVE_QUEUE_STATES = new Set([
	"active",
	"delayed",
	"prioritized",
	"waiting",
	"waiting-children",
]);

type RecoverableItem = Pick<
	InsightRunItem,
	| "id"
	| "organizationId"
	| "queueJobId"
	| "runId"
	| "status"
	| "updatedAt"
	| "websiteId"
> &
	Pick<InsightRun, "reason" | "requestedByUserId">;

type RollupRun = Pick<
	InsightRun,
	"id" | "organizationId" | "reason" | "timezone"
>;

interface RunStatusSummary {
	completedItems: number;
	failedItems: number;
	queuedItems: number;
	run: RollupRun | null;
	runningItems: number;
	settled: boolean;
	skippedItems: number;
	status: InsightRunStatus;
	totalItems: number;
}

export interface InsightRecoveryResult {
	keptItems: number;
	requeuedItems: number;
	requeuedRollups: number;
	scannedItems: number;
	scannedRuns: number;
	syncedRuns: number;
}

type MissingRollupRun = Pick<
	InsightRun,
	"completedItems" | "id" | "organizationId" | "reason" | "status" | "timezone"
>;

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

type StaleQueueState =
	| { kind: "active" }
	| { kind: "missing"; reason: string }
	| { kind: "terminal"; reason: string };

async function staleItemQueueState(
	item: RecoverableItem
): Promise<StaleQueueState> {
	if (!item.queueJobId) {
		return {
			kind: "missing",
			reason: "Insight queue job id is missing after stale timeout",
		};
	}

	const job = await getInsightsQueue().getJob(item.queueJobId);
	if (!job) {
		return {
			kind: "missing",
			reason: "Insight queue job is missing after stale timeout",
		};
	}

	const state = await job.getState();
	if (ACTIVE_QUEUE_STATES.has(state)) {
		return { kind: "active" };
	}
	return {
		kind: "terminal",
		reason: `Insight queue job is ${state} but the database item is still ${item.status}`,
	};
}

async function requeueStaleItem(
	item: RecoverableItem,
	now: Date,
	rotateJobId: boolean
): Promise<boolean> {
	const queueJobId =
		rotateJobId || !item.queueJobId
			? `${insightsWebsiteJobId(item.runId, item.websiteId)}-recovery-${randomUUIDv7()}`
			: item.queueJobId;
	const claimed = await db
		.update(insightRunItems)
		.set({
			errorMessage: null,
			finishedAt: null,
			queueJobId,
			startedAt: null,
			status: "queued",
			updatedAt: now,
		})
		.where(
			and(
				eq(insightRunItems.id, item.id),
				eq(insightRunItems.status, item.status),
				eq(insightRunItems.updatedAt, item.updatedAt),
				item.queueJobId
					? eq(insightRunItems.queueJobId, item.queueJobId)
					: isNull(insightRunItems.queueJobId)
			)
		)
		.returning({ id: insightRunItems.id });
	if (claimed.length === 0) {
		return false;
	}

	try {
		await getInsightsQueue().add(
			INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
			{
				itemId: item.id,
				organizationId: item.organizationId,
				reason: item.reason,
				requestedByUserId: item.requestedByUserId,
				runId: item.runId,
				websiteId: item.websiteId,
			},
			{ jobId: queueJobId }
		);
	} catch (error) {
		await db
			.update(insightRunItems)
			.set({ updatedAt: item.updatedAt })
			.where(
				and(
					eq(insightRunItems.id, item.id),
					eq(insightRunItems.status, "queued"),
					eq(insightRunItems.queueJobId, queueJobId),
					eq(insightRunItems.updatedAt, now)
				)
			);
		throw error;
	}

	emitInsightsEvent("warn", "recovery.stale_job_requeued", {
		item_id: item.id,
		organization_id: item.organizationId,
		queue_job_id: queueJobId,
		run_id: item.runId,
		previous_status: item.status,
		rotated_job_id: queueJobId !== item.queueJobId,
		website_id: item.websiteId,
	});
	return true;
}

async function staleItems(cutoff: Date): Promise<RecoverableItem[]> {
	return await db
		.select({
			id: insightRunItems.id,
			organizationId: insightRunItems.organizationId,
			queueJobId: insightRunItems.queueJobId,
			reason: insightRuns.reason,
			requestedByUserId: insightRuns.requestedByUserId,
			runId: insightRunItems.runId,
			status: insightRunItems.status,
			updatedAt: insightRunItems.updatedAt,
			websiteId: insightRunItems.websiteId,
		})
		.from(insightRunItems)
		.innerJoin(insightRuns, eq(insightRuns.id, insightRunItems.runId))
		.where(
			and(
				or(
					inArray(insightRunItems.status, ["queued", "running"]),
					and(
						eq(insightRunItems.status, "failed"),
						isNotNull(insightRunItems.preparedAt),
						eq(insightRunItems.preparedStatus, "succeeded"),
						notExists(
							db
								.select({ id: insightRunEffects.id })
								.from(insightRunEffects)
								.where(
									and(
										eq(insightRunEffects.runItemId, insightRunItems.id),
										ne(insightRunEffects.status, "succeeded")
									)
								)
						)
					)
				),
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

export async function finalizeCompletedPreparedItem(
	itemId: string,
	now = new Date()
): Promise<boolean> {
	const result = await loadCompletedPreparedResult(itemId);
	if (!result) {
		return false;
	}
	const recoverableStatuses: InsightRunItem["status"][] =
		result.status === "succeeded"
			? ["failed", "queued", "running"]
			: ["queued", "running"];
	const updated = await db
		.update(insightRunItems)
		.set({
			errorMessage:
				result.status === "skipped" ? (result.message ?? null) : null,
			finishedAt: now,
			resultCount: result.resultCount,
			status: result.status,
			updatedAt: now,
		})
		.where(
			and(
				eq(insightRunItems.id, itemId),
				inArray(insightRunItems.status, recoverableStatuses)
			)
		)
		.returning({ id: insightRunItems.id });
	return updated.length === 1;
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
	const summary = await db.transaction(async (tx) => {
		const [run] = await tx
			.select()
			.from(insightRuns)
			.where(eq(insightRuns.id, runId))
			.limit(1)
			.for("update");
		const items = await tx
			.select({
				errorMessage: insightRunItems.errorMessage,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.runId, runId));

		const completedItems = items.filter(
			(item) => item.status === "succeeded"
		).length;
		const failedItems = items.filter((item) => item.status === "failed").length;
		const queuedItems = items.filter((item) => item.status === "queued").length;
		const runningItems = items.filter(
			(item) => item.status === "running"
		).length;
		const skippedItems = items.filter(
			(item) => item.status === "skipped"
		).length;
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
		const finishedAt = settled
			? run?.status === status && run.finishedAt
				? run.finishedAt
				: now
			: null;
		await tx
			.update(insightRuns)
			.set({
				completedItems,
				errorMessage:
					settled && failedItems > 0 ? summarizeItemErrors(items) : null,
				failedItems,
				finishedAt,
				skippedItems,
				status,
				updatedAt: now,
			})
			.where(eq(insightRuns.id, runId));

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
	});

	setInsightsLog({
		run_status: summary.status,
		run_total_items: summary.totalItems,
		run_completed_items: summary.completedItems,
		run_failed_items: summary.failedItems,
		run_queued_items: summary.queuedItems,
		run_running_items: summary.runningItems,
		run_skipped_items: summary.skippedItems,
		run_settled: summary.settled,
	});
	return summary;
}

export async function queueRollupIfSettled(
	summary: RunStatusSummary,
	options: { repairCompleted?: boolean } = {}
): Promise<boolean> {
	if (!(summary.run && summary.settled && summary.completedItems > 0)) {
		return false;
	}
	if (
		summary.status !== "succeeded" &&
		summary.status !== "partially_succeeded"
	) {
		return false;
	}

	try {
		const queue = getInsightsQueue();
		const jobId = insightsRollupJobId(summary.run.id);
		const existing = await queue.getJob(jobId);
		if (existing) {
			const state = await existing.getState();
			if (ACTIVE_QUEUE_STATES.has(state)) {
				return false;
			}
			if (
				state === "failed" ||
				(state === "completed" && options.repairCompleted)
			) {
				await existing.retry(state, {
					resetAttemptsMade: true,
					resetAttemptsStarted: true,
				});
				emitInsightsEvent("warn", "recovery.rollup_retried", {
					run_id: summary.run.id,
					organization_id: summary.run.organizationId,
					previous_job_state: state,
				});
				return true;
			}
			return false;
		}

		await queue.add(
			INSIGHTS_ROLLUP_JOB_NAME,
			{
				organizationId: summary.run.organizationId,
				reason: summary.run.reason,
				runId: summary.run.id,
				timezone: summary.run.timezone,
			},
			{ jobId }
		);
		emitInsightsEvent("info", "recovery.rollup_queued", {
			run_id: summary.run.id,
			organization_id: summary.run.organizationId,
			run_status: summary.status,
			completed_items: summary.completedItems,
		});
		return true;
	} catch (error) {
		captureInsightsError(error, "recovery.rollup_queue_failed", {
			run_id: summary.run.id,
			organization_id: summary.run.organizationId,
		});
		return false;
	}
}

async function latestSettledRunsMissingRollup(): Promise<MissingRollupRun[]> {
	const result = await db.execute<MissingRollupRun>(sql`
		with latest_settled as (
			select
				${insightRuns.id} as id,
				${insightRuns.organizationId} as "organizationId",
				${insightRuns.reason} as reason,
				${insightRuns.status} as status,
				${insightRuns.timezone} as timezone,
				${insightRuns.completedItems} as "completedItems",
				row_number() over (
					partition by ${insightRuns.organizationId}
					order by ${insightRuns.createdAt} desc, ${insightRuns.id} desc
				) as position
			from ${insightRuns}
			where ${insightRuns.status} in ('succeeded', 'partially_succeeded')
				and ${insightRuns.completedItems} > 0
				and ${insightRuns.finishedAt} is not null
		)
		select
			latest_settled.id,
			latest_settled."organizationId",
			latest_settled.reason,
			latest_settled.status,
			latest_settled.timezone,
			latest_settled."completedItems"
		from latest_settled
		where latest_settled.position = 1
			and (
				select count(*)
				from ${insightRollups}
				where ${insightRollups.runId} = latest_settled.id
			) < ${ROLLUP_RANGE_COUNT}
		limit ${MAX_STALE_RUNS_PER_SWEEP}
	`);
	return result.rows;
}

export async function recoverStaleInsightRuns(
	now = new Date()
): Promise<InsightRecoveryResult> {
	const startedAt = performance.now();
	const cutoff = new Date(now.getTime() - getInsightsStaleItemMs());
	const items = await staleItems(cutoff);
	const affectedRunIds = new Set<string>();
	let keptItems = 0;
	let requeuedItems = 0;
	let requeuedRollups = 0;

	for (const item of items) {
		if (item.status === "failed") {
			affectedRunIds.add(item.runId);
			if (await finalizeCompletedPreparedItem(item.id, now)) {
				emitInsightsEvent("info", "recovery.prepared_item_completed", {
					item_id: item.id,
					queue_job_id: item.queueJobId,
					run_id: item.runId,
					previous_status: item.status,
				});
			}
			keptItems += 1;
			continue;
		}

		const queueState = await staleItemQueueState(item);
		if (queueState.kind === "active") {
			keptItems += 1;
			continue;
		}
		if (await finalizeCompletedPreparedItem(item.id, now)) {
			affectedRunIds.add(item.runId);
			keptItems += 1;
			emitInsightsEvent("info", "recovery.prepared_item_completed", {
				item_id: item.id,
				queue_job_id: item.queueJobId,
				run_id: item.runId,
			});
			continue;
		}
		try {
			affectedRunIds.add(item.runId);
			if (
				await requeueStaleItem(
					item,
					now,
					item.status === "running" || queueState.kind === "terminal"
				)
			) {
				requeuedItems += 1;
			} else {
				keptItems += 1;
			}
		} catch (error) {
			keptItems += 1;
			captureInsightsError(error, "recovery.stale_job_requeue_failed", {
				item_id: item.id,
				organization_id: item.organizationId,
				queue_job_id: item.queueJobId,
				queue_state: queueState.kind,
				run_id: item.runId,
				website_id: item.websiteId,
			});
		}
	}

	const runIds = new Set([...affectedRunIds, ...(await staleRunIds(cutoff))]);

	for (const runId of runIds) {
		const summary = await syncRunStatus(runId);
		await queueRollupIfSettled(summary);
	}

	for (const run of await latestSettledRunsMissingRollup()) {
		if (
			await queueRollupIfSettled(
				{
					completedItems: run.completedItems,
					failedItems: 0,
					queuedItems: 0,
					run,
					runningItems: 0,
					settled: true,
					skippedItems: 0,
					status: run.status,
					totalItems: run.completedItems,
				},
				{ repairCompleted: true }
			)
		) {
			requeuedRollups += 1;
		}
	}

	emitInsightsEvent("info", "recovery.sweep_completed", {
		duration_ms: Math.round(performance.now() - startedAt),
		kept_items: keptItems,
		requeued_items: requeuedItems,
		requeued_rollups: requeuedRollups,
		scanned_items: items.length,
		synced_runs: runIds.size,
	});

	return {
		keptItems,
		requeuedItems,
		requeuedRollups,
		scannedItems: items.length,
		scannedRuns: runIds.size,
		syncedRuns: runIds.size,
	};
}
