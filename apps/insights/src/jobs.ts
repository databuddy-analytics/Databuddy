import { and, db, eq, inArray, lt, notInArray, sql } from "@databuddy/db";
import { insightRunItems, insightRuns } from "@databuddy/db/schema";
import {
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
	INSIGHTS_QUEUE_NAME,
	INSIGHTS_RESUME_JOB_NAME,
	type InsightsGenerateWebsiteJobData,
	type InsightsQueueJobData,
	type InsightsResumeJobData,
	insightsResumeJobId,
} from "@databuddy/redis";
import type { Job } from "bullmq";
import { z } from "zod";
import {
	generateWebsiteInsights,
	type GenerateWebsiteInsightsResult,
} from "./generation";
import {
	type InsightRunIdentity,
	loadCompletedPreparedResult,
	runIdentityCondition,
} from "./effects";
import { recoverStaleInsightRuns, syncRunStatus } from "./recovery";
import {
	captureInsightsError,
	createInsightsEventLog,
	emitInsightsEvent,
	setInsightsLog,
	toError,
	withInsightsLogContext,
} from "./lib/evlog-insights";
import { recordInsightReplyFailure, resumeInsightReply } from "./resume";
import { dispatchDueInsightRuns } from "./scheduler";

const SUCCESS_CHECKPOINT_ATTEMPTS = 3;
const SUCCESSFUL_ITEM_STATUSES: ("skipped" | "succeeded")[] = [
	"skipped",
	"succeeded",
];
const resumeJobSchema = z
	.object({ replyId: z.string().min(1).max(256) })
	.strict();

type InsightsJob = Pick<
	Job<InsightsQueueJobData>,
	"attemptsMade" | "attemptsStarted" | "data" | "id" | "name" | "opts"
>;

interface CanonicalGenerateItem extends InsightRunIdentity {
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
		Partial<InsightsResumeJobData> & { reason?: string };
	return {
		attempts_configured: job.opts.attempts,
		attempts_made: job.attemptsMade,
		attempts_started: job.attemptsStarted,
		job_id: job.id,
		job_name: job.name,
		organization_id: data.organizationId,
		queue_name: INSIGHTS_QUEUE_NAME,
		reason: data.reason,
		reply_id: data.replyId,
		run_id: data.runId,
		website_id: data.websiteId,
	};
}

async function processResumeJob(
	queuedData: InsightsResumeJobData,
	job: InsightsJob
): Promise<{ status: "skipped" | "succeeded" }> {
	const data = resumeJobSchema.parse(queuedData);
	if (
		typeof job.id !== "string" ||
		job.id !== insightsResumeJobId(data.replyId)
	) {
		throw new Error("Insight reply queue job identity does not match");
	}
	try {
		return { status: await resumeInsightReply(data.replyId) };
	} catch (error) {
		try {
			await recordInsightReplyFailure(data.replyId, isFinalAttempt(job));
		} catch (deliveryError) {
			captureInsightsError(
				deliveryError,
				"resume.slack_failure_delivery.failed",
				{
					reply_id: data.replyId,
				}
			);
		}
		throw error;
	}
}

function itemResult(item: {
	message: string | null;
	resultCount: number;
	status: "skipped" | "succeeded";
}): GenerateWebsiteInsightsResult {
	return {
		...(item.message ? { message: item.message } : {}),
		resultCount: item.resultCount,
		status: item.status,
	};
}

function successfulItemResult(item: {
	errorMessage: string | null;
	resultCount: number;
	status: typeof insightRunItems.$inferSelect.status;
}): GenerateWebsiteInsightsResult | null {
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
): Promise<GenerateWebsiteInsightsResult | null> {
	const [item] = await db
		.select({
			errorMessage: insightRunItems.errorMessage,
			resultCount: insightRunItems.resultCount,
			status: insightRunItems.status,
		})
		.from(insightRunItems)
		.where(runIdentityCondition(identity))
		.limit(1);
	return item ? successfulItemResult(item) : null;
}

async function checkpointSuccessfulItem(
	identity: InsightRunIdentity,
	result: GenerateWebsiteInsightsResult,
	activation: number
): Promise<void> {
	let lastError: unknown;
	for (let attempt = 0; attempt < SUCCESS_CHECKPOINT_ATTEMPTS; attempt += 1) {
		let updated: { id: string }[];
		try {
			const now = new Date();
			updated = await db
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
						runIdentityCondition(identity),
						eq(insightRunItems.attempts, activation)
					)
				)
				.returning({ id: insightRunItems.id });
		} catch (error) {
			lastError = error;
			continue;
		}
		if (updated.length === 0) {
			throw new Error(
				"Insight run item lease was superseded before success checkpoint"
			);
		}
		return;
	}
	throw lastError;
}

async function finishGenerationFailure(params: {
	activation: number;
	data: CanonicalGenerateItem;
	error: unknown;
	job: InsightsJob;
}): Promise<GenerateWebsiteInsightsResult> {
	const recovered = await loadCompletedPreparedResult(params.data);
	if (recovered) {
		await checkpointSuccessfulItem(params.data, recovered, params.activation);
		await syncRunStatus(params.data.runId);
		emitInsightsEvent("warn", "job.generate_website.concurrent_success", {
			...jobContext(params.job),
			error_message: errorMessage(params.error),
			item_id: params.data.itemId,
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
				runIdentityCondition(params.data),
				eq(insightRunItems.attempts, params.activation),
				notInArray(insightRunItems.status, SUCCESSFUL_ITEM_STATUSES)
			)
		)
		.returning({ id: insightRunItems.id });

	if (updated.length === 0) {
		const completed = await loadSuccessfulItem(params.data);
		if (completed) {
			await syncRunStatus(params.data.runId);
			return completed;
		}
		throw params.error;
	}

	let runStatus: string | undefined;
	try {
		const summary = await syncRunStatus(params.data.runId);
		runStatus = summary.status;
	} catch (error) {
		captureInsightsError(error, "job.generate_website.finalization_failed", {
			...jobContext(params.job),
			item_id: params.data.itemId,
		});
	}
	captureInsightsError(params.error, "job.generate_website.failed", {
		...jobContext(params.job),
		final_attempt: finalAttempt,
		item_id: params.data.itemId,
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
		await syncRunStatus(data.runId);
		return { resultCount: completed.resultCount, status: completed.status };
	}

	const now = new Date();
	// Unlike attemptsMade, this advances when BullMQ restarts a stalled job.
	const activation = job.attemptsStarted;
	const started = await db.transaction(async (tx) => {
		const claimed = await tx
			.update(insightRunItems)
			.set({
				attempts: activation,
				errorMessage: null,
				finishedAt: null,
				startedAt: now,
				status: "running",
				updatedAt: now,
			})
			.where(
				and(
					runIdentityCondition(data),
					inArray(insightRunItems.status, ["queued", "running"]),
					lt(insightRunItems.attempts, activation)
				)
			)
			.returning({ id: insightRunItems.id });
		if (claimed.length === 0) {
			return false;
		}
		await tx
			.update(insightRuns)
			.set({
				startedAt: sql`coalesce(${insightRuns.startedAt}, ${now})`,
				status: "running",
				updatedAt: now,
			})
			.where(
				and(
					eq(insightRuns.id, data.runId),
					eq(insightRuns.organizationId, data.organizationId)
				)
			);
		return true;
	});
	if (!started) {
		const concurrentlyCompleted = await loadSuccessfulItem(data);
		if (concurrentlyCompleted) {
			await syncRunStatus(data.runId);
			return {
				resultCount: concurrentlyCompleted.resultCount,
				status: concurrentlyCompleted.status,
			};
		}
		throw new Error(
			"Insight run item is already claimed by this or a newer queue attempt"
		);
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
		const recovered = await finishGenerationFailure({
			activation,
			data,
			error,
			job,
		});
		return { resultCount: recovered.resultCount, status: recovered.status };
	}

	await checkpointSuccessfulItem(data, result, activation);
	await syncRunStatus(data.runId);
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
			} else if (job.name === INSIGHTS_RESUME_JOB_NAME) {
				result = await processResumeJob(job.data as InsightsResumeJobData, job);
			} else {
				throw new Error(`Unknown insights job: ${job.name}`);
			}

			const durationMs = Math.round(performance.now() - startedAt);
			setInsightsLog({
				duration_ms: durationMs,
				job_status: "succeeded",
			});
			logger.emit({ duration_ms: durationMs, job_status: "succeeded" });
			return result;
		} catch (error) {
			const durationMs = Math.round(performance.now() - startedAt);
			const err = toError(error);
			logger.error(err);
			logger.emit({
				_forceKeep: true,
				duration_ms: durationMs,
				error_message: err.message,
				job_status: "failed",
			});
			throw error;
		}
	});
}
