import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const kafkaConfigs: unknown[] = [];
const producers: ReturnType<typeof createProducer>[] = [];
const captureError = mock(() => {});
const clickHouseInsert = mock(() => Promise.resolve());

class KafkaMock {
	constructor(config: unknown) {
		kafkaConfigs.push(config);
	}

	producer() {
		const producer = producers.shift();
		if (!producer) {
			throw new Error("No test producer configured");
		}
		return producer;
	}
}

mock.module("kafkajs", () => ({
	CompressionTypes: { GZIP: 1 },
	Kafka: KafkaMock,
}));

mock.module("./tracing", () => ({ captureError }));
mock.module("@databuddy/db/clickhouse", () => ({
	clickHouse: { insert: clickHouseInsert },
}));

const { disconnectProducer, sendUptimeEvent } = await import("./producer");

const environmentKeys = [
	"SELFHOST",
	"REDPANDA_BROKER",
	"REDPANDA_PASSWORD",
	"REDPANDA_USER",
] as const;
const originalEnvironment = new Map(
	environmentKeys.map((key) => [key, process.env[key]])
);

function createProducer(
	overrides: Partial<{
		connect: () => Promise<void>;
		disconnect: () => Promise<void>;
		send: () => Promise<void>;
	}> = {}
) {
	return {
		connect: mock(overrides.connect ?? (() => Promise.resolve())),
		disconnect: mock(overrides.disconnect ?? (() => Promise.resolve())),
		send: mock(overrides.send ?? (() => Promise.resolve())),
	};
}

beforeEach(async () => {
	await disconnectProducer();
	kafkaConfigs.length = 0;
	producers.length = 0;
	captureError.mockClear();
	clickHouseInsert.mockClear();
	process.env.SELFHOST = "false";
	process.env.REDPANDA_BROKER = "redpanda.test:9092";
	delete process.env.REDPANDA_PASSWORD;
	delete process.env.REDPANDA_USER;
});

afterAll(async () => {
	await disconnectProducer();
	for (const key of environmentKeys) {
		const value = originalEnvironment.get(key);
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
});

describe("sendUptimeEvent", () => {
	test("self-hosting waits for ClickHouse persistence and ignores a configured broker", async () => {
		process.env.SELFHOST = "true";
		let resolveInsert: (() => void) | undefined;
		clickHouseInsert.mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					resolveInsert = resolve;
				})
		);
		const event = { site_id: "site_test", timestamp: 1_789_516_800_000 };
		let settled = false;
		const delivery = sendUptimeEvent(event).then(() => {
			settled = true;
		});
		await Bun.sleep(0);

		expect(settled).toBe(false);
		expect(clickHouseInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				table: "uptime.uptime_monitor",
				values: [event],
				format: "JSONEachRow",
				abort_signal: expect.any(AbortSignal),
				clickhouse_settings: {
					async_insert: 0,
				},
			})
		);
		resolveInsert?.();
		await delivery;
		expect(kafkaConfigs).toEqual([]);
	});

	test("self-hosted insert failures reach the delivery worker for retry", async () => {
		process.env.SELFHOST = "true";
		const error = new Error("ClickHouse unavailable");
		clickHouseInsert.mockRejectedValueOnce(error);

		await expect(sendUptimeEvent({ site_id: "site_test" })).rejects.toBe(error);
		expect(kafkaConfigs).toEqual([]);
	});

	test("shares one in-flight connection across concurrent cold-start sends", async () => {
		let resolveConnection: (() => void) | undefined;
		const producer = createProducer({
			connect: () =>
				new Promise<void>((resolve) => {
					resolveConnection = resolve;
				}),
		});
		producers.push(producer);

		const sends = Array.from({ length: 20 }, () =>
			sendUptimeEvent({ ok: true })
		);

		expect(producer.connect).toHaveBeenCalledTimes(1);
		expect(resolveConnection).toBeDefined();
		resolveConnection?.();

		await Promise.all(sends);
		expect(producer.send).toHaveBeenCalledTimes(20);
		expect(producer.send).toHaveBeenCalledWith(
			expect.objectContaining({ acks: -1 })
		);
		expect(kafkaConfigs).toHaveLength(1);
	});

	test("disconnects a failed producer and reconnects for the next event", async () => {
		const failedProducer = createProducer({
			send: () => Promise.reject(new Error("broker unavailable")),
		});
		const recoveredProducer = createProducer();
		producers.push(failedProducer, recoveredProducer);

		await expect(sendUptimeEvent({ attempt: 1 })).rejects.toThrow(
			"broker unavailable"
		);
		expect(failedProducer.disconnect).toHaveBeenCalledTimes(1);

		await expect(sendUptimeEvent({ attempt: 2 })).resolves.toBeUndefined();
		expect(recoveredProducer.connect).toHaveBeenCalledTimes(1);
		expect(recoveredProducer.send).toHaveBeenCalledTimes(1);
		expect(kafkaConfigs).toHaveLength(2);
	});

	test("reconnects after a failed cold-start connection", async () => {
		const failedProducer = createProducer({
			connect: () => Promise.reject(new Error("broker unavailable")),
		});
		const recoveredProducer = createProducer();
		producers.push(failedProducer, recoveredProducer);

		await expect(sendUptimeEvent({ attempt: 1 })).rejects.toThrow(
			"broker unavailable"
		);

		await expect(sendUptimeEvent({ attempt: 2 })).resolves.toBeUndefined();
		expect(recoveredProducer.connect).toHaveBeenCalledTimes(1);
		expect(recoveredProducer.send).toHaveBeenCalledTimes(1);
		expect(kafkaConfigs).toHaveLength(2);
	});

	test("rejects when Kafka is not configured", async () => {
		delete process.env.REDPANDA_BROKER;

		await expect(sendUptimeEvent({ ok: true })).rejects.toThrow(
			"REDPANDA_BROKER not set"
		);
		expect(kafkaConfigs).toEqual([]);
	});

	test("always uses TLS, including without SASL credentials", async () => {
		const producer = createProducer();
		producers.push(producer);

		await expect(sendUptimeEvent({ ok: true })).resolves.toBeUndefined();
		expect(kafkaConfigs[0]).toEqual(expect.objectContaining({ ssl: true }));
		expect(kafkaConfigs[0]).not.toHaveProperty("sasl");
	});
});
