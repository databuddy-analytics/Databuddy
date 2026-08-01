import {
	getBullMQConnectionOptions,
	getBullMQWorkerConnectionOptions,
} from "@databuddy/redis";
import { type Job, Queue, Worker } from "bullmq";
import { log } from "evlog";
import { captureError, setAttributes } from "./logging";
import {
	sendLinkVisit,
	type LinkVisitDeliveryOptions,
	type LinkVisitEvent,
} from "./producer";

export const LINK_VISIT_QUEUE_NAME = "link-visit-delivery";
export const LINK_VISIT_JOB_NAME = "deliver-link-visit";
export const LINK_VISIT_BACKOFF_TYPE = "link-visit-capped";
export const KAFKA_ATTEMPTED_FIELD = "__kafka_attempted";

export interface LinkVisitJobData extends LinkVisitEvent {
	readonly __kafka_attempted?: true;
}

export const LINK_VISIT_JOB_OPTIONS = {
	attempts: 20,
	backoff: {
		type: LINK_VISIT_BACKOFF_TYPE,
		delay: 1000,
	},
	removeOnComplete: {
		age: 24 * 3600,
		count: 100_000,
	},
	removeOnFail: {
		age: 7 * 24 * 3600,
		count: 100_000,
	},
};
const RETRY_LOG_INTERVAL_MS = 30_000;
const MAX_RETRY_DELAY_MS = 60_000;
export const LINK_VISIT_QUEUE_IO_TIMEOUT_MS = 1500;
const LINK_VISIT_QUEUE_HEALTH_TIMEOUT_MS = 1250;

export class LinkVisitQueueAdmissionTimeoutError extends Error {
	readonly deadlineMs: number;

	constructor(deadlineMs: number) {
		super(`Link visit queue admission exceeded ${deadlineMs}ms`);
		this.deadlineMs = deadlineMs;
		this.name = "LinkVisitQueueAdmissionTimeoutError";
	}
}

let queue: Queue<LinkVisitJobData> | null = null;
let worker: Worker<LinkVisitJobData> | null = null;
let lastRetryLogAt = 0;
let suppressedRetryLogs = 0;

interface LinkVisitQueueWriter {
	add(
		name: string,
		data: LinkVisitJobData,
		options: { jobId: string }
	): Promise<unknown>;
}

interface CloseableLinkVisitQueueWriter extends LinkVisitQueueWriter {
	close(): Promise<void>;
}

interface LinkVisitQueueHealthWriter extends CloseableLinkVisitQueueWriter {
	getJobCounts(
		...types: Array<"active" | "delayed" | "failed" | "waiting">
	): Promise<unknown>;
}

export function getWorkerConcurrency(): number {
	const raw = process.env.LINK_VISIT_WORKER_CONCURRENCY?.trim();
	const configured = raw ? Number(raw) : Number.NaN;
	return Number.isSafeInteger(configured) && configured > 0 ? configured : 2;
}

export function getLinkVisitRetryDelay(attemptsMade: number): number {
	const exponent = Math.max(0, attemptsMade - 1);
	return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** exponent);
}

export function getLinkVisitQueueConnectionOptions() {
	return {
		...getBullMQConnectionOptions(),
		commandTimeout: LINK_VISIT_QUEUE_IO_TIMEOUT_MS,
		connectTimeout: LINK_VISIT_QUEUE_IO_TIMEOUT_MS,
		enableOfflineQueue: false,
		// The HTTP writer is disposable. Do not let BullMQ wait through an
		// unbounded reconnect loop before Queue.add can start its command timer.
		retryStrategy: () => null,
	};
}

function getLinkVisitQueue(): Queue<LinkVisitJobData> {
	if (queue) {
		return queue;
	}

	queue = new Queue<LinkVisitJobData>(LINK_VISIT_QUEUE_NAME, {
		connection: getLinkVisitQueueConnectionOptions(),
		defaultJobOptions: LINK_VISIT_JOB_OPTIONS,
	});
	queue.on("error", (error) => {
		captureError(error, { error_step: "link_visit_queue_error" });
	});
	return queue;
}

export async function enqueueLinkVisit(event: LinkVisitEvent): Promise<void> {
	const targetQueue = getLinkVisitQueue();
	await addLinkVisitJobWithinDeadline(targetQueue, event, {
		onDiscard: () => {
			if (queue === targetQueue) {
				queue = null;
			}
		},
	});
	setAttributes({
		click_admitted: true,
		click_delivery: "bullmq",
		link_visit_job_id: event.id,
	});
}

export async function addLinkVisitJobWithinDeadline(
	targetQueue: CloseableLinkVisitQueueWriter,
	event: LinkVisitEvent,
	options: {
		readonly deadlineMs?: number;
		readonly onDiscard?: () => void;
	} = {}
): Promise<void> {
	const deadlineMs = options.deadlineMs ?? LINK_VISIT_QUEUE_IO_TIMEOUT_MS;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(
			() => reject(new LinkVisitQueueAdmissionTimeoutError(deadlineMs)),
			deadlineMs
		);
		timeout.unref?.();
	});

	try {
		await Promise.race([addLinkVisitJob(targetQueue, event), deadline]);
	} catch (error) {
		// Discard and close this exact writer before rejecting. Queue.close aborts
		// BullMQ while RedisConnection is still initializing, so a timed-out add
		// cannot wake later and silently enqueue after the redirect returned 503.
		options.onDiscard?.();
		Promise.resolve()
			.then(() => targetQueue.close())
			.catch((closeError) => {
				captureError(closeError, {
					error_step: "link_visit_queue_discard_close",
				});
			});
		throw error;
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
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
	job: Pick<Job<LinkVisitJobData>, "data" | "name" | "updateData">,
	deliver: (
		event: LinkVisitEvent,
		key?: string,
		options?: LinkVisitDeliveryOptions
	) => Promise<boolean> = sendLinkVisit
): Promise<void> {
	if (job.name !== LINK_VISIT_JOB_NAME) {
		throw new Error(`Unknown link visit job: ${job.name}`);
	}

	const { __kafka_attempted: kafkaAttempted, ...event } = job.data;
	const options: LinkVisitDeliveryOptions = {
		allowDirectFallback: kafkaAttempted !== true,
		...(kafkaAttempted
			? {}
			: {
					beforeKafkaSend: async () => {
						await job.updateData({
							...job.data,
							[KAFKA_ATTEMPTED_FIELD]: true,
						});
					},
				}),
	};
	const acknowledged = await deliver(event, event.link_id, options);
	if (!acknowledged) {
		throw new Error("Link visit was not acknowledged by a delivery sink");
	}
}

export function startLinkVisitDeliveryWorker(): Worker<LinkVisitJobData> {
	if (worker) {
		return worker;
	}

	worker = new Worker<LinkVisitJobData>(
		LINK_VISIT_QUEUE_NAME,
		(job) => processLinkVisitJob(job),
		{
			connection: getBullMQWorkerConnectionOptions(),
			concurrency: getWorkerConcurrency(),
			lockDuration: 60_000,
			stalledInterval: 90_000,
			settings: {
				backoffStrategy: (attemptsMade, type) =>
					type === LINK_VISIT_BACKOFF_TYPE
						? getLinkVisitRetryDelay(attemptsMade)
						: 0,
			},
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

export function checkLinkVisitQueueHealth() {
	return getLinkVisitQueue().getJobCounts(
		"waiting",
		"active",
		"delayed",
		"failed"
	);
}

export async function closeLinkVisitDeliveryResources(
	activeWorker: Pick<Worker<LinkVisitJobData>, "close"> | null,
	activeQueue: Pick<Queue<LinkVisitJobData>, "close"> | null
): Promise<void> {
	const results = await Promise.allSettled([
		...(activeWorker
			? [Promise.resolve().then(() => activeWorker.close())]
			: []),
		...(activeQueue ? [Promise.resolve().then(() => activeQueue.close())] : []),
	]);
	const failures = results.flatMap((result) =>
		result.status === "rejected" ? [result.reason] : []
	);
	if (failures.length > 0) {
		throw new AggregateError(
			failures,
			"Failed to close one or more link-visit delivery resources"
		);
	}
}

export async function closeLinkVisitDelivery(): Promise<void> {
	const activeWorker = worker;
	worker = null;
	const activeQueue = queue;
	queue = null;
	await closeLinkVisitDeliveryResources(activeWorker, activeQueue);
}
