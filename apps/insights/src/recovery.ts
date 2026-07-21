import {
	and,
	asc,
	db,
	eq,
	inArray,
	isNotNull,
	lt,
	ne,
	notExists,
	or,
} from "@databuddy/db";
import {
	insightRunEffects,
	insightRunItems,
	insightRuns,
	insightReplies,
	type InsightRunItem,
	type InsightRunStatus,
} from "@databuddy/db/schema";
import {
	enqueueInsightsResume,
	getInsightsQueue,
	INSIGHTS_JOB_TIMEOUT_MS,
} from "@databuddy/redis";
import { emitInsightsEvent, setInsightsLog } from "./lib/evlog-insights";
import { loadCompletedPreparedResult } from "./effects";

const STALE_ITEM_MS = Math.max(15 * 60 * 1000, INSIGHTS_JOB_TIMEOUT_MS * 4);
const MAX_STALE_ITEMS_PER_SWEEP = 100;
const MAX_STALE_REPLIES_PER_SWEEP = 100;
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
	"id" | "queueJobId" | "runId" | "status" | "updatedAt"
>;

interface RunStatusSummary {
	completedItems: number;
	failedItems: number;
	queuedItems: number;
	runningItems: number;
	settled: boolean;
	skippedItems: number;
	status: InsightRunStatus;
	totalItems: number;
}

async function recoverStaleReplies(cutoff: Date): Promise<{
	recovered: number;
	scanned: number;
}> {
	const replies = await db
		.select({
			createdAt: insightReplies.createdAt,
			id: insightReplies.id,
			status: insightReplies.status,
		})
		.from(insightReplies)
		.where(
			and(
				inArray(insightReplies.status, ["queued", "running"]),
				lt(insightReplies.createdAt, cutoff)
			)
		)
		.orderBy(asc(insightReplies.createdAt))
		.limit(MAX_STALE_REPLIES_PER_SWEEP);

	let recovered = 0;
	for (const reply of replies) {
		const status = await enqueueInsightsResume(reply.id);
		const updated = await db
			.update(insightReplies)
			.set({ status })
			.where(
				and(
					eq(insightReplies.id, reply.id),
					eq(insightReplies.status, reply.status),
					eq(insightReplies.createdAt, reply.createdAt)
				)
			)
			.returning({ id: insightReplies.id });
		if (updated.length === 1) {
			recovered += 1;
			emitInsightsEvent("info", "recovery.reply_reconciled", {
				reply_id: reply.id,
				previous_status: reply.status,
				status,
			});
		}
	}
	return { recovered, scanned: replies.length };
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
			updatedAt: insightRunItems.updatedAt,
		})
		.from(insightRunItems)
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
		await tx
			.select({ id: insightRuns.id })
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
		await tx
			.update(insightRuns)
			.set({
				completedItems,
				errorMessage:
					settled && failedItems > 0 ? summarizeItemErrors(items) : null,
				failedItems,
				finishedAt: settled ? now : null,
				skippedItems,
				status,
				updatedAt: now,
			})
			.where(eq(insightRuns.id, runId));

		return {
			completedItems,
			failedItems,
			queuedItems,
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

export async function recoverStaleInsightRuns(now = new Date()) {
	const startedAt = performance.now();
	const cutoff = new Date(now.getTime() - STALE_ITEM_MS);
	const replies = await recoverStaleReplies(cutoff);
	const items = await staleItems(cutoff);
	const affectedRunIds = new Set<string>();
	let failedItems = 0;
	let keptItems = 0;

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

		const reason = await staleItemFailureReason(item);
		if (!reason) {
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

		const updated = await db
			.update(insightRunItems)
			.set({
				errorMessage: reason,
				finishedAt: now,
				status: "failed",
				updatedAt: now,
			})
			.where(
				and(
					eq(insightRunItems.id, item.id),
					eq(insightRunItems.status, item.status),
					eq(insightRunItems.updatedAt, item.updatedAt)
				)
			)
			.returning({ id: insightRunItems.id });
		if (updated.length === 0) {
			affectedRunIds.add(item.runId);
			keptItems += 1;
			emitInsightsEvent("info", "recovery.stale_item_changed", {
				item_id: item.id,
				queue_job_id: item.queueJobId,
				run_id: item.runId,
				previous_status: item.status,
			});
			continue;
		}
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
		await syncRunStatus(runId);
	}

	emitInsightsEvent("info", "recovery.sweep_completed", {
		duration_ms: Math.round(performance.now() - startedAt),
		failed_items: failedItems,
		kept_items: keptItems,
		scanned_items: items.length,
		recovered_replies: replies.recovered,
		scanned_replies: replies.scanned,
		synced_runs: runIds.size,
	});

	return {
		failedItems,
		keptItems,
		recoveredReplies: replies.recovered,
		scannedItems: items.length,
		scannedReplies: replies.scanned,
		scannedRuns: runIds.size,
		syncedRuns: runIds.size,
	};
}
