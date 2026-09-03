import { Queue } from "bullmq";
import { getBullMQConnectionOptions } from "./bullmq";

export const UPTIME_QUEUE_NAME = "uptime-checks";
export const UPTIME_CHECK_JOB_NAME = "uptime-check";
export const UPTIME_DELIVERY_QUEUE_NAME = "uptime-event-delivery";
export const UPTIME_DELIVERY_JOB_NAME = UPTIME_DELIVERY_QUEUE_NAME;

// BullMQ appends a full stack trace per attempt; without a cap the 20-attempt
// delivery queue stores twenty of them per job for the whole removeOnFail window.
const RETAINED_STACK_TRACES = 3;

export const UPTIME_WORKER_LOCK_MS = 90_000;
export const UPTIME_WORKER_STALLED_INTERVAL_MS = 60_000;
export const UPTIME_WORKER_MAX_STALLED_COUNT = 3;

export const UPTIME_JOB_OPTIONS = {
	attempts: 3,
	backoff: {
		type: "exponential",
		delay: 5000,
	},
	stackTraceLimit: RETAINED_STACK_TRACES,
	// A failed source job can contain the only durable copy of a completed probe.
	removeOnComplete: {
		age: 24 * 3600,
		count: 1000,
	},
	removeOnFail: {
		age: 24 * 3600,
		count: 5000,
	},
};

export const UPTIME_DELIVERY_JOB_OPTIONS = {
	attempts: 20,
	backoff: {
		type: "fixed",
		delay: 30_000,
	},
	stackTraceLimit: RETAINED_STACK_TRACES,
	// Keep completed IDs long enough for an ambiguous queue add to stay idempotent.
	removeOnComplete: {
		age: 7 * 24 * 3600,
		count: 10_000,
	},
	removeOnFail: {
		age: 7 * 24 * 3600,
		count: 10_000,
	},
};

export interface UptimeCheckJobData {
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
