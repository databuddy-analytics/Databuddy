import { Queue } from "bullmq";
import { getBullMQConnectionOptions } from "./bullmq";

export const UPTIME_QUEUE_NAME = "uptime-checks";
export const UPTIME_CHECK_JOB_NAME = "uptime-check";
export const UPTIME_DELIVERY_QUEUE_NAME = "uptime-event-delivery";
export const UPTIME_DELIVERY_JOB_NAME = UPTIME_DELIVERY_QUEUE_NAME;

export const UPTIME_JOB_TIMEOUT_MS = 30_000;
const UPTIME_RETRY_ATTEMPTS = 1_000_000;
const UPTIME_RETRY_DELAY_MS = 30_000;
const UPTIME_RETRY_OPTIONS = {
	attempts: UPTIME_RETRY_ATTEMPTS,
	backoff: {
		type: "fixed",
		delay: UPTIME_RETRY_DELAY_MS,
	},
	removeOnFail: false,
};

/**
 * Check jobs remain recoverable after an infrastructure outage. A target that
 * is down produces an UptimeData result and completes normally, so these
 * retries only cover transient processing or durable-handoff failures.
 */
export const UPTIME_JOB_OPTIONS = {
	...UPTIME_RETRY_OPTIONS,
	removeOnComplete: {
		age: 24 * 3600,
		count: 1000,
	},
	// A failed job can contain the only durable copy of a completed probe.
	// Retain it for inspection/re-drive instead of silently expiring it.
};

export const UPTIME_DELIVERY_JOB_OPTIONS = {
	...UPTIME_RETRY_OPTIONS,
	// Keep completed IDs long enough to make a retry after an ambiguous queue
	// add idempotent. Replaying after that is still safe because event_id stays
	// stable through the analytics pipeline.
	removeOnComplete: {
		age: 7 * 24 * 3600,
		count: 10_000,
	},
};

export interface UptimeCheckJobData {
	// The uptime worker validates this JSON payload before replaying it.
	delivery?: { event: unknown };
	scheduleId: string;
	trigger: "manual" | "scheduled";
}

export interface UptimeDeliveryJobData {
	event: unknown;
}

let uptimeQueue: Queue<UptimeCheckJobData> | null = null;
let uptimeDeliveryQueue: Queue<UptimeDeliveryJobData> | null = null;

export function getUptimeQueue(): Queue<UptimeCheckJobData> {
	uptimeQueue ??= new Queue<UptimeCheckJobData>(UPTIME_QUEUE_NAME, {
		connection: getBullMQConnectionOptions(),
		defaultJobOptions: UPTIME_JOB_OPTIONS,
	});

	return uptimeQueue;
}

export function getUptimeDeliveryQueue(): Queue<UptimeDeliveryJobData> {
	uptimeDeliveryQueue ??= new Queue<UptimeDeliveryJobData>(
		UPTIME_DELIVERY_QUEUE_NAME,
		{
			connection: getBullMQConnectionOptions(),
			defaultJobOptions: UPTIME_DELIVERY_JOB_OPTIONS,
		}
	);

	return uptimeDeliveryQueue;
}

export async function closeUptimeQueue(): Promise<void> {
	const queues = [uptimeQueue, uptimeDeliveryQueue];
	uptimeQueue = null;
	uptimeDeliveryQueue = null;
	await Promise.all(queues.map((queue) => queue?.close()));
}

export function uptimeSchedulerId(scheduleId: string): string {
	return `uptime-${scheduleId}`;
}

export function uptimeImmediateJobId(scheduleId: string): string {
	return `uptime-manual-${scheduleId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function uptimeDeliveryJobId(eventId: string): string {
	return `uptime-delivery-${eventId}`;
}
