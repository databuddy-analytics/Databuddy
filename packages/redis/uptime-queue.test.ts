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
	UPTIME_JOB_OPTIONS,
	UPTIME_QUEUE_NAME,
	uptimeImmediateJobId,
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

	it("generates unique immediate job ids per invocation", () => {
		const first = uptimeImmediateJobId("schedule-1");
		const second = uptimeImmediateJobId("schedule-1");

		expect(first.startsWith("uptime-manual-schedule-1-")).toBe(true);
		expect(second.startsWith("uptime-manual-schedule-1-")).toBe(true);
		expect(first).not.toBe(second);
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

});
