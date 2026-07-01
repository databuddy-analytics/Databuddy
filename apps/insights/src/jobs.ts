import { db, eq, sql } from "@databuddy/db";
import { insightRunItems, insightRuns } from "@databuddy/db/schema";
import {
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
	INSIGHTS_QUEUE_NAME,
	INSIGHTS_ROLLUP_JOB_NAME,
	type InsightsGenerateWebsiteJobData,
	type InsightsQueueJobData,
	type InsightsRollupJobData,
} from "@databuddy/redis";
import type { Job } from "bullmq";
import { generateWebsiteInsights } from "./generation";
import {
	queueRollupIfSettled,
	recoverStaleInsightRuns,
	syncRunStatus,
} from "./recovery";
import {
	captureInsightsError,
	createInsightsEventLog,
	emitInsightsEvent,
	setInsightsLog,
	toError,
	withInsightsLogContext,
} from "./lib/evlog-insights";
import { processRollupJob } from "./rollup";
import { dispatchDueInsightRuns } from "./scheduler";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isFinalAttempt(job: Job<InsightsQueueJobData>): boolean {
	return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

function jobContext(job: Job<InsightsQueueJobData>) {
	const data = job.data as Partial<InsightsGenerateWebsiteJobData> &
		Partial<InsightsRollupJobData> & { reason?: string };
	return {
		attempts_configured: job.opts.attempts,
		attempts_made: job.attemptsMade,
		job_id: job.id,
		job_name: job.name,
		organization_id: data.organizationId,
		queue_name: INSIGHTS_QUEUE_NAME,
		reason: data.reason,
		run_id: data.runId,
		website_id: data.websiteId,
	};
}

async function processGenerateWebsiteJob(
	data: InsightsGenerateWebsiteJobData,
	job: Job<InsightsQueueJobData>
): Promise<{ resultCount: number; status: "skipped" | "succeeded" }> {
	const now = new Date();
	await Promise.all([
		db
			.update(insightRuns)
			.set({
				status: "running",
				startedAt: sql`coalesce(${insightRuns.startedAt}, ${now})`,
				updatedAt: now,
			})
			.where(eq(insightRuns.id, data.runId)),
		db
			.update(insightRunItems)
			.set({
				attempts: job.attemptsMade + 1,
				errorMessage: null,
				finishedAt: null,
				startedAt: now,
				status: "running",
				updatedAt: now,
			})
			.where(eq(insightRunItems.id, data.itemId)),
	]);

	try {
		const result = await generateWebsiteInsights({
			config: data.config,
			organizationId: data.organizationId,
			reason: data.reason,
			requestedByUserId: data.requestedByUserId ?? null,
			runId: data.runId,
			websiteId: data.websiteId,
		});

		await db
			.update(insightRunItems)
			.set({
				errorMessage: result.message ?? null,
				finishedAt: new Date(),
				resultCount: result.resultCount,
				status: result.status,
				updatedAt: new Date(),
			})
			.where(eq(insightRunItems.id, data.itemId));
		const summary = await syncRunStatus(data.runId);
		setInsightsLog({
			run_status: summary.status,
			run_completed_items: summary.completedItems,
			run_failed_items: summary.failedItems,
			run_skipped_items: summary.skippedItems,
			run_total_items: summary.totalItems,
		});
		await queueRollupIfSettled(summary);
		return { resultCount: result.resultCount, status: result.status };
	} catch (error) {
		const finalAttempt = isFinalAttempt(job);
		const message = errorMessage(error);
		await db
			.update(insightRunItems)
			.set({
				errorMessage: finalAttempt
					? message
					: `Attempt ${job.attemptsMade + 1} failed, retrying: ${message}`,
				finishedAt: finalAttempt ? new Date() : null,
				status: finalAttempt ? "failed" : "queued",
				updatedAt: new Date(),
			})
			.where(eq(insightRunItems.id, data.itemId));
		const summary = await syncRunStatus(data.runId);
		await queueRollupIfSettled(summary);
		captureInsightsError(error, "job.generate_website.failed", {
			...jobContext(job),
			item_id: data.itemId,
			final_attempt: finalAttempt,
			next_status: finalAttempt ? "failed" : "queued",
			run_status: summary.status,
		});
		throw error;
	}
}

export async function processInsightsJob(job: Job<InsightsQueueJobData>) {
	const startedAt = performance.now();
	const context = jobContext(job);
	const logger = createInsightsEventLog({
		...context,
		insights_event: "job.process",
	});

	return await withInsightsLogContext(logger, async () => {
		emitInsightsEvent("info", "job.started", context);
		try {
			let result: unknown;
			if (job.name === INSIGHTS_DISPATCH_JOB_NAME) {
				result = await dispatchDueInsightRuns();
			} else if (job.name === INSIGHTS_MAINTENANCE_JOB_NAME) {
				result = await recoverStaleInsightRuns();
			} else if (job.name === INSIGHTS_GENERATE_WEBSITE_JOB_NAME) {
				result = await processGenerateWebsiteJob(
					job.data as InsightsGenerateWebsiteJobData,
					job
				);
			} else if (job.name === INSIGHTS_ROLLUP_JOB_NAME) {
				result = await processRollupJob(job.data as InsightsRollupJobData);
			} else {
				throw new Error(`Unknown insights job: ${job.name}`);
			}

			const durationMs = Math.round(performance.now() - startedAt);
			setInsightsLog({
				duration_ms: durationMs,
				job_status: "succeeded",
			});
			emitInsightsEvent("info", "job.completed", {
				...context,
				duration_ms: durationMs,
			});
			logger.emit({ duration_ms: durationMs, job_status: "succeeded" });
			return result;
		} catch (error) {
			const durationMs = Math.round(performance.now() - startedAt);
			const err = toError(error);
			logger.error(err);
			logger.emit({
				duration_ms: durationMs,
				error_message: err.message,
				job_status: "failed",
				_forceKeep: true,
			});
			captureInsightsError(error, "job.failed", {
				...context,
				duration_ms: durationMs,
			});
			throw error;
		}
	});
}
