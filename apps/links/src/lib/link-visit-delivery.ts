import {
	getBullMQConnectionOptions,
	getBullMQWorkerConnectionOptions,
} from "@databuddy/redis";
import { type Job, Queue, Worker } from "bullmq";
import { log } from "evlog";
import { captureError, setAttributes } from "./logging";
import { sendLinkVisit, type LinkVisitEvent } from "./producer";

export const LINK_VISIT_QUEUE_NAME = "link-visit-delivery";
export const LINK_VISIT_JOB_NAME = "deliver-link-visit";

const LINK_VISIT_JOB_OPTIONS = {
	attempts: 20,
	backoff: {
		type: "exponential" as const,
		delay: 1000,
	},
	removeOnComplete: {
		age: 24 * 3600,
		count: 100_000,
	},
	// Failed jobs are a replayable incident record. Never discard them
	// automatically; operators can retry them after the dependency recovers.
	removeOnFail: false,
};
const RETRY_LOG_INTERVAL_MS = 30_000;

let queue: Queue<LinkVisitEvent> | null = null;
let worker: Worker<LinkVisitEvent> | null = null;
let lastRetryLogAt = 0;
let suppressedRetryLogs = 0;

interface LinkVisitQueueWriter {
	add(
		name: string,
		data: LinkVisitEvent,
		options: { jobId: string }
	): Promise<unknown>;
}

function getWorkerConcurrency(): number {
	const configured = Number.parseInt(
		process.env.LINK_VISIT_WORKER_CONCURRENCY ?? "",
		10
	);
	return Number.isSafeInteger(configured) && configured > 0 ? configured : 2;
}

function getLinkVisitQueue(): Queue<LinkVisitEvent> {
	if (queue) {
		return queue;
	}

	queue = new Queue<LinkVisitEvent>(LINK_VISIT_QUEUE_NAME, {
		connection: getBullMQConnectionOptions(),
		defaultJobOptions: LINK_VISIT_JOB_OPTIONS,
	});
	queue.on("error", (error) => {
		captureError(error, { error_step: "link_visit_queue_error" });
	});
	return queue;
}

export async function enqueueLinkVisit(event: LinkVisitEvent): Promise<void> {
	await addLinkVisitJob(getLinkVisitQueue(), event);
	setAttributes({
		click_admitted: true,
		click_delivery: "bullmq",
		link_visit_job_id: event.id,
	});
}

export async function addLinkVisitJob(
	targetQueue: LinkVisitQueueWriter,
	event: LinkVisitEvent
): Promise<void> {
	await targetQueue.add(LINK_VISIT_JOB_NAME, event, {
		jobId: event.id,
	});
}

export async function processLinkVisitJob(
	job: Pick<Job<LinkVisitEvent>, "data" | "name">,
	deliver: (
		event: LinkVisitEvent,
		key?: string
	) => Promise<boolean> = sendLinkVisit
): Promise<void> {
	if (job.name !== LINK_VISIT_JOB_NAME) {
		throw new Error(`Unknown link visit job: ${job.name}`);
	}

	const acknowledged = await deliver(job.data, job.data.link_id);
	if (!acknowledged) {
		throw new Error("Link visit was not acknowledged by Redpanda");
	}
}

export function startLinkVisitDeliveryWorker(): Worker<LinkVisitEvent> {
	if (worker) {
		return worker;
	}

	worker = new Worker<LinkVisitEvent>(
		LINK_VISIT_QUEUE_NAME,
		(job) => processLinkVisitJob(job),
		{
			connection: getBullMQWorkerConnectionOptions(),
			concurrency: getWorkerConcurrency(),
			lockDuration: 60_000,
			stalledInterval: 90_000,
		}
	);

	worker.on("failed", (job, error) => {
		const attemptsMade = job?.attemptsMade ?? 0;
		const maxAttempts = job?.opts.attempts ?? LINK_VISIT_JOB_OPTIONS.attempts;
		const fields = {
			error_step: "link_visit_delivery_failed",
			job_id: job?.id ?? "unknown",
			attempts_used: attemptsMade,
			attempts_max: maxAttempts,
			is_final_attempt: attemptsMade >= maxAttempts,
		};
		if (fields.is_final_attempt) {
			captureError(error, fields);
			return;
		}
		const now = Date.now();
		if (now - lastRetryLogAt < RETRY_LOG_INTERVAL_MS) {
			suppressedRetryLogs += 1;
			return;
		}
		log.warn({
			...fields,
			error_message: error.message,
			suppressed_retry_logs: suppressedRetryLogs,
		});
		lastRetryLogAt = now;
		suppressedRetryLogs = 0;
	});
	worker.on("stalled", (jobId) => {
		log.warn({
			error_step: "link_visit_delivery_stalled",
			error_message: "BullMQ link visit job stalled",
			job_id: jobId,
		});
	});
	worker.on("error", (error) => {
		captureError(error, { error_step: "link_visit_delivery_worker_error" });
	});

	return worker;
}

export async function checkLinkVisitQueueHealth(): Promise<void> {
	await getLinkVisitQueue().getJobCounts(
		"waiting",
		"active",
		"delayed",
		"failed"
	);
}

export async function closeLinkVisitDelivery(): Promise<void> {
	const activeWorker = worker;
	worker = null;
	if (activeWorker) {
		await activeWorker.close();
	}

	const activeQueue = queue;
	queue = null;
	if (activeQueue) {
		await activeQueue.close();
	}
}
