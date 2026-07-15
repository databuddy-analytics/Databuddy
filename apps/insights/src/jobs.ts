import {
	and,
	db,
	eq,
	isNull,
	notInArray,
	or,
	sql,
	withTransaction,
} from "@databuddy/db";
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
import {
	generateWebsiteInsights,
	type GenerateWebsiteInsightsResult,
} from "./generation";
import {
	type InsightRunIdentity,
	loadCompletedPreparedResult,
} from "./effects";
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
import {
	dispatchDueInsightRuns,
	scheduledDispatchOrganizations,
} from "./scheduler";

const SUCCESS_CHECKPOINT_ATTEMPTS = 3;
const SUCCESSFUL_ITEM_STATUSES: ("skipped" | "succeeded")[] = [
	"skipped",
	"succeeded",
];

type GenerateJobResult = Pick<
	GenerateWebsiteInsightsResult,
	"message" | "resultCount" | "status"
>;

type InsightsJob = Pick<
	Job<InsightsQueueJobData>,
	"attemptsMade" | "data" | "id" | "name" | "opts"
>;

interface CanonicalGenerateItem extends InsightRunIdentity {
	attempts: number;
	errorMessage: string | null;
	queueJobId: string;
	reason: InsightsGenerateWebsiteJobData["reason"];
	requestedByUserId: string | null;
	resultCount: number;
	status: typeof insightRunItems.$inferSelect.status;
	timezone: string;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isFinalAttempt(job: InsightsJob): boolean {
	return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

function jobContext(job: InsightsJob) {
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

function itemResult(item: {
	message: string | null;
	resultCount: number;
	status: "skipped" | "succeeded";
}): GenerateJobResult {
	return {
		...(item.message ? { message: item.message } : {}),
		resultCount: item.resultCount,
		status: item.status,
	};
}

function itemIdentityCondition(identity: InsightRunIdentity) {
	return and(
		eq(insightRunItems.id, identity.itemId),
		eq(insightRunItems.runId, identity.runId),
		eq(insightRunItems.organizationId, identity.organizationId),
		eq(insightRunItems.websiteId, identity.websiteId),
		identity.queueJobId === null
			? isNull(insightRunItems.queueJobId)
			: eq(insightRunItems.queueJobId, identity.queueJobId)
	);
}

function successfulItemResult(item: {
	errorMessage: string | null;
	resultCount: number;
	status: typeof insightRunItems.$inferSelect.status;
}): GenerateJobResult | null {
	if (item.status !== "skipped" && item.status !== "succeeded") {
		return null;
	}
	return itemResult({
		message: item.errorMessage,
		resultCount: item.resultCount,
		status: item.status,
	});
}

async function loadCanonicalGenerateItem(
	data: InsightsGenerateWebsiteJobData,
	job: InsightsJob
): Promise<CanonicalGenerateItem> {
	const [item] = await db
		.select({
			attempts: insightRunItems.attempts,
			errorMessage: insightRunItems.errorMessage,
			itemId: insightRunItems.id,
			organizationId: insightRunItems.organizationId,
			queueJobId: insightRunItems.queueJobId,
			reason: insightRuns.reason,
			requestedByUserId: insightRuns.requestedByUserId,
			resultCount: insightRunItems.resultCount,
			runId: insightRunItems.runId,
			status: insightRunItems.status,
			timezone: insightRuns.timezone,
			websiteId: insightRunItems.websiteId,
		})
		.from(insightRunItems)
		.innerJoin(
			insightRuns,
			and(
				eq(insightRuns.id, insightRunItems.runId),
				eq(insightRuns.organizationId, insightRunItems.organizationId)
			)
		)
		.where(eq(insightRunItems.id, data.itemId))
		.limit(1);

	if (
		!item ||
		typeof job.id !== "string" ||
		item.queueJobId !== job.id ||
		item.runId !== data.runId ||
		item.organizationId !== data.organizationId ||
		item.websiteId !== data.websiteId
	) {
		throw new Error("Insight queue job identity does not match its run item");
	}

	return { ...item, queueJobId: job.id };
}

async function loadSuccessfulItem(
	identity: InsightRunIdentity
): Promise<GenerateJobResult | null> {
	const [item] = await db
		.select({
			errorMessage: insightRunItems.errorMessage,
			resultCount: insightRunItems.resultCount,
			status: insightRunItems.status,
		})
		.from(insightRunItems)
		.where(itemIdentityCondition(identity))
		.limit(1);
	return item ? successfulItemResult(item) : null;
}

async function checkpointSuccessfulItem(
	identity: InsightRunIdentity,
	result: GenerateJobResult
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < SUCCESS_CHECKPOINT_ATTEMPTS; attempt += 1) {
		try {
			const now = new Date();
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
				.where(itemIdentityCondition(identity))
				.returning({ id: insightRunItems.id });
			if (updated.length === 0) {
				throw new Error("Insight run item is missing at success checkpoint");
			}
			return;
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}

async function finalizeRun(runId: string) {
	const summary = await syncRunStatus(runId);
	setInsightsLog({
		run_status: summary.status,
		run_completed_items: summary.completedItems,
		run_failed_items: summary.failedItems,
		run_skipped_items: summary.skippedItems,
		run_total_items: summary.totalItems,
	});
	await queueRollupIfSettled(summary);
	return summary;
}

async function finishGenerationFailure(params: {
	data: CanonicalGenerateItem;
	error: unknown;
	job: InsightsJob;
}): Promise<GenerateJobResult> {
	const recovered = await loadCompletedPreparedResult(params.data);
	if (recovered) {
		await checkpointSuccessfulItem(params.data, recovered);
		await finalizeRun(params.data.runId);
		emitInsightsEvent("warn", "job.generate_website.concurrent_success", {
			...jobContext(params.job),
			item_id: params.data.itemId,
			error_message: errorMessage(params.error),
		});
		return recovered;
	}

	const finalAttempt = isFinalAttempt(params.job);
	const message = errorMessage(params.error);
	const updated = await db
		.update(insightRunItems)
		.set({
			errorMessage: finalAttempt
				? message
				: `Attempt ${params.job.attemptsMade + 1} failed, retrying: ${message}`,
			finishedAt: finalAttempt ? new Date() : null,
			status: finalAttempt ? "failed" : "queued",
			updatedAt: new Date(),
		})
		.where(
			and(
				itemIdentityCondition(params.data),
				notInArray(insightRunItems.status, SUCCESSFUL_ITEM_STATUSES)
			)
		)
		.returning({ id: insightRunItems.id });

	if (updated.length === 0) {
		const completed = await loadSuccessfulItem(params.data);
		if (completed) {
			await finalizeRun(params.data.runId);
			return completed;
		}
	}

	let runStatus: string | undefined;
	try {
		const summary = await finalizeRun(params.data.runId);
		runStatus = summary.status;
	} catch (error) {
		captureInsightsError(error, "job.generate_website.finalization_failed", {
			...jobContext(params.job),
			item_id: params.data.itemId,
		});
	}
	captureInsightsError(params.error, "job.generate_website.failed", {
		...jobContext(params.job),
		item_id: params.data.itemId,
		final_attempt: finalAttempt,
		next_status: finalAttempt ? "failed" : "queued",
		run_status: runStatus,
	});
	throw params.error;
}

async function processGenerateWebsiteJob(
	queuedData: InsightsGenerateWebsiteJobData,
	job: InsightsJob
): Promise<{ resultCount: number; status: "skipped" | "succeeded" }> {
	const data = await loadCanonicalGenerateItem(queuedData, job);
	const completed = successfulItemResult(data);
	if (completed) {
		await finalizeRun(data.runId);
		return { resultCount: completed.resultCount, status: completed.status };
	}

	const now = new Date();
	const started = await withTransaction(async (tx) => {
		const claimed = await tx
			.update(insightRunItems)
			.set({
				attempts: job.attemptsMade + 1,
				errorMessage: null,
				finishedAt: null,
				startedAt: now,
				status: "running",
				updatedAt: now,
			})
			.where(
				and(
					itemIdentityCondition(data),
					or(
						eq(insightRunItems.status, "queued"),
						and(
							eq(insightRunItems.status, "running"),
							eq(insightRunItems.attempts, job.attemptsMade)
						)
					)
				)
			)
			.returning({ id: insightRunItems.id });
		if (claimed.length === 0) {
			return claimed;
		}
		await tx
			.update(insightRuns)
			.set({
				status: "running",
				startedAt: sql`coalesce(${insightRuns.startedAt}, ${now})`,
				updatedAt: now,
			})
			.where(
				and(
					eq(insightRuns.id, data.runId),
					eq(insightRuns.organizationId, data.organizationId)
				)
			);
		return claimed;
	});
	if (started.length === 0) {
		const concurrentlyCompleted = await loadSuccessfulItem(data);
		if (concurrentlyCompleted) {
			await finalizeRun(data.runId);
			return {
				resultCount: concurrentlyCompleted.resultCount,
				status: concurrentlyCompleted.status,
			};
		}
		throw new Error("Insight run item is already running or unavailable");
	}
	let result: GenerateWebsiteInsightsResult;
	try {
		result = await generateWebsiteInsights({
			finalAttempt: isFinalAttempt(job),
			itemId: data.itemId,
			organizationId: data.organizationId,
			queueJobId: data.queueJobId,
			reason: data.reason,
			requestedByUserId: data.requestedByUserId ?? null,
			runId: data.runId,
			timezone: data.timezone,
			websiteId: data.websiteId,
		});
	} catch (error) {
		const recovered = await finishGenerationFailure({ data, error, job });
		return { resultCount: recovered.resultCount, status: recovered.status };
	}

	await checkpointSuccessfulItem(data, result);
	await finalizeRun(data.runId);
	return { resultCount: result.resultCount, status: result.status };
}

export async function processInsightsJob(job: InsightsJob) {
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
				const organizations = scheduledDispatchOrganizations();
				if (organizations === null || organizations.length > 0) {
					result = await dispatchDueInsightRuns(
						new Date(),
						organizations ?? undefined
					);
				} else {
					result = { status: "disabled" };
					emitInsightsEvent("info", "scheduler.dispatch_job_ignored", context);
				}
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
