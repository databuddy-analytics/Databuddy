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

const DEFAULT_INSIGHTS_WORKER_CONCURRENCY = 2;
const TRANSIENT_REDIS_ERROR =
	/^READONLY |^ERR caller gone|ECONNRESET|Connection is closed|Socket closed unexpectedly/;

function getInsightsWorkerConcurrency(
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

	worker.on("stalled", (jobId) => {
		emitInsightsEvent("warn", "worker.job_stalled", {
			job_id: jobId,
		});
	});

	worker.on("error", (error) => {
		const level = TRANSIENT_REDIS_ERROR.test(error.message) ? "warn" : "error";
		emitInsightsEvent(level, "worker.error", {
			error_message: error.message,
			error_stack: error.stack,
		});
	});

	return worker;
}
