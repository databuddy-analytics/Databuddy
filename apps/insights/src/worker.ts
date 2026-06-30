import {
	getBullMQWorkerConnectionOptions,
	INSIGHTS_JOB_TIMEOUT_MS,
	INSIGHTS_QUEUE_ENV_PREFIX,
	INSIGHTS_QUEUE_NAME,
	type InsightsQueueJobData,
} from "@databuddy/redis";
import { Worker } from "bullmq";
import { processInsightsJob } from "./jobs";
import { emitInsightsEvent } from "./lib/evlog-insights";
import { getInsightsWorkerErrorLevel } from "./worker-errors";
import { buildInsightsStalledJobEvent } from "./worker-events";

const DEFAULT_INSIGHTS_WORKER_CONCURRENCY = 5;

export function getInsightsWorkerConcurrency(
	value = process.env.INSIGHTS_WORKER_CONCURRENCY
): number {
	if (value === undefined || value.trim() === "") {
		return DEFAULT_INSIGHTS_WORKER_CONCURRENCY;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return DEFAULT_INSIGHTS_WORKER_CONCURRENCY;
	}

	return parsed;
}

export function startInsightsWorker() {
	const concurrency = getInsightsWorkerConcurrency();
	emitInsightsEvent("info", "worker.starting", {
		queue_name: INSIGHTS_QUEUE_NAME,
		concurrency,
		lock_duration_ms: INSIGHTS_JOB_TIMEOUT_MS * 2,
		stalled_interval_ms: INSIGHTS_JOB_TIMEOUT_MS * 3,
	});

	const worker = new Worker<InsightsQueueJobData>(
		INSIGHTS_QUEUE_NAME,
		async (job) => await processInsightsJob(job),
		{
			connection: getBullMQWorkerConnectionOptions({
				envPrefix: INSIGHTS_QUEUE_ENV_PREFIX,
			}),
			concurrency,
			lockDuration: INSIGHTS_JOB_TIMEOUT_MS * 2,
			stalledInterval: INSIGHTS_JOB_TIMEOUT_MS * 3,
		}
	);

	worker.on("failed", (job, error) => {
		emitInsightsEvent("error", "worker.job_failed", {
			error_message: error.message,
			error_stack: error.stack,
			job_id: job?.id,
			job_name: job?.name,
			attempts_made: job?.attemptsMade ?? 0,
		});
	});

	worker.on("completed", (job) => {
		emitInsightsEvent("info", "worker.job_completed", {
			job_id: job.id,
			job_name: job.name,
			attempts_made: job.attemptsMade,
			duration_ms:
				job.finishedOn && job.processedOn
					? job.finishedOn - job.processedOn
					: undefined,
		});
	});

	worker.on("stalled", (jobId) => {
		emitInsightsEvent("warn", "worker.job_stalled", {
			...buildInsightsStalledJobEvent(jobId),
		});
	});

	worker.on("error", (error) => {
		const level = getInsightsWorkerErrorLevel(error);
		emitInsightsEvent(level, "worker.error", {
			error_message: error.message,
			error_stack: error.stack,
		});
	});

	return worker;
}
