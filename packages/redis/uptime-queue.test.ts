import { afterEach, describe, expect, it, mock } from "bun:test";

let constructorCalls: Array<{ name: string; options: Record<string, unknown> }> =
	[];
let closeCalls = 0;

class MockQueue {
	name: string;
	options: Record<string, unknown>;

	constructor(name: string, options: Record<string, unknown>) {
		this.name = name;
		this.options = options;
		constructorCalls.push({ name, options });
	}

	async close() {
		closeCalls += 1;
	}
}

mock.module("bullmq", () => ({
	Queue: MockQueue,
}));

process.env.BULLMQ_REDIS_URL = "redis://queue-user:queue-pass@queue.test:6381/4";

const {
	closeUptimeQueue,
	getUptimeDeliveryQueue,
	getUptimeQueue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_DELIVERY_JOB_NAME,
	UPTIME_DELIVERY_JOB_OPTIONS,
	UPTIME_DELIVERY_QUEUE_NAME,
	UPTIME_JOB_OPTIONS,
	UPTIME_QUEUE_NAME,
	uptimeDeliveryJobId,
	uptimeImmediateJobId,
	uptimeSchedulerId,
} = await import("./uptime-queue");

afterEach(async () => {
	await closeUptimeQueue();
	constructorCalls = [];
	closeCalls = 0;
});

describe("uptime queue", () => {
	it("constructs a BullMQ queue with the expected name, connection, and defaults", () => {
		const queue = getUptimeQueue();

		expect(queue).toBeInstanceOf(MockQueue);
		expect(constructorCalls).toHaveLength(1);
		expect(constructorCalls[0]).toEqual({
			name: UPTIME_QUEUE_NAME,
			options: {
				connection: {
					host: "queue.test",
					port: 6381,
					username: "queue-user",
					password: "queue-pass",
					db: 4,
					maxRetriesPerRequest: 1,
				},
				defaultJobOptions: UPTIME_JOB_OPTIONS,
			},
		});
	});

	it("reuses the queue singleton until closed", () => {
		const first = getUptimeQueue();
		const second = getUptimeQueue();

		expect(first).toBe(second);
		expect(constructorCalls).toHaveLength(1);
	});

	it("constructs a separate durable delivery queue", () => {
		const queue = getUptimeDeliveryQueue();

		expect(queue).toBeInstanceOf(MockQueue);
		expect(constructorCalls).toHaveLength(1);
		expect(constructorCalls[0]).toEqual({
			name: UPTIME_DELIVERY_QUEUE_NAME,
			options: {
				connection: {
					host: "queue.test",
					port: 6381,
					username: "queue-user",
					password: "queue-pass",
					db: 4,
					maxRetriesPerRequest: 1,
				},
				defaultJobOptions: UPTIME_DELIVERY_JOB_OPTIONS,
			},
		});
	});

	it("closes and resets the singleton", async () => {
		const first = getUptimeQueue();
		const firstDelivery = getUptimeDeliveryQueue();

		await closeUptimeQueue();
		const second = getUptimeQueue();
		const secondDelivery = getUptimeDeliveryQueue();

		expect(closeCalls).toBe(2);
		expect(second).not.toBe(first);
		expect(secondDelivery).not.toBe(firstDelivery);
		expect(constructorCalls).toHaveLength(4);
	});

	it("uses stable queue constants and namespaced ids", () => {
		const first = uptimeImmediateJobId("schedule-1");
		const second = uptimeImmediateJobId("schedule-1");

		expect(UPTIME_CHECK_JOB_NAME).toBe("uptime-check");
		expect(UPTIME_QUEUE_NAME).toBe("uptime-checks");
		expect(UPTIME_DELIVERY_JOB_NAME).toBe("uptime-event-delivery");
		expect(UPTIME_DELIVERY_QUEUE_NAME).toBe("uptime-event-delivery");
		expect(uptimeSchedulerId("schedule-1")).toBe("uptime-schedule-1");
		expect(uptimeDeliveryJobId("event-1")).toBe("uptime-delivery-event-1");
		expect(first.startsWith("uptime-manual-schedule-1-")).toBe(true);
		expect(second.startsWith("uptime-manual-schedule-1-")).toBe(true);
		expect(first).not.toBe(second);
	});

	it("keeps source and delivery jobs retryable through infrastructure outages", () => {
		expect(UPTIME_JOB_OPTIONS).toMatchObject({
			attempts: 1_000_000,
			backoff: { delay: 30_000, type: "fixed" },
			removeOnFail: false,
		});
		expect(UPTIME_DELIVERY_JOB_OPTIONS).toMatchObject({
			attempts: 1_000_000,
			backoff: { delay: 30_000, type: "fixed" },
			removeOnFail: false,
		});
	});
});
