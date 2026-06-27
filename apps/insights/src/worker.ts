import {
	getBullMQWorkerConnectionOptions,
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_JOB_TIMEOUT_MS,
	INSIGHTS_MAINTENANCE_JOB_NAME,
	INSIGHTS_QUEUE_ENV_PREFIX,
	INSIGHTS_QUEUE_NAME,
	INSIGHTS_ROLLUP_JOB_NAME,
	type InsightsQueueJobData,
} from "@databuddy/redis";
import { Worker } from "bullmq";
import { processInsightsJob } from "./jobs";
import { emitInsightsEvent } from "./lib/evlog-insights";

const DEFAULT_INSIGHTS_WORKER_CONCURRENCY = 5;

function inferJobNameFromId(jobId: string): string {
	if (jobId.startsWith("insights-website-")) return INSIGHTS_GENERATE_WEBSITE_JOB_NAME;
	if (jobId.startsWith("insights-rollup-")) return INSIGHTS_ROLLUP_JOB_NAME;
	if (jobId.startsWith("repeat:insights-dispatch:")) return INSIGHTS_DISPATCH_JOB_NAME;
	if (jobId.startsWith("repeat:insights-maintenance:")) return INSIGHTS_MAINTENANCE_JOB_NAME;
	return "unknown";
}

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
		// Stalled jobs are part of BullMQ's normal recovery path: the lock expired
		// (typically during a worker restart/deploy) and the job is moved back to
		// "waiting" for retry. Log at warn, not error — terminal failures are already
		// captured by the "failed" handler above.
		emitInsightsEvent("warn", "worker.job_stalled", {
			job_id: jobId,
			job_name: inferJobNameFromId(jobId),
		});
	});

	worker.on("error", (error) => {
		emitInsightsEvent("error", "worker.error", {
			error_message: error.message,
			error_stack: error.stack,
		});
	});

	return worker;
}
