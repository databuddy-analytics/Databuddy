import { beforeEach, describe, expect, mock, test } from "bun:test";

const setAttributes = mock(() => {});
const captureError = mock(() => {});
const mergeWideEvent = mock(() => {});
const clickHouseInsert = mock(() => Promise.resolve());
const kafkaConfigs: Array<Record<string, unknown>> = [];

type FakeProducer = {
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	send: () => Promise<void>;
};

let nextProducer: FakeProducer | null = null;
const createProducer = mock(() => {
	if (!nextProducer) {
		throw new Error("No Kafka producer configured for test");
	}
	return nextProducer;
});

class MockKafka {
	constructor(config: Record<string, unknown>) {
		kafkaConfigs.push(config);
	}

	producer(options: Record<string, unknown>) {
		return createProducer(options);
	}
}

mock.module("./logging", () => ({
	captureError,
	mergeWideEvent,
	record: async <T>(_name: string, run: () => Promise<T> | T) => run(),
	setAttributes,
}));

mock.module("@databuddy/db/clickhouse", () => ({
	clickHouse: { insert: clickHouseInsert },
	TABLE_NAMES: { link_visits: "analytics.link_visits" },
}));

mock.module("kafkajs", () => ({
	CompressionTypes: { GZIP: 1 },
	Kafka: MockKafka,
}));

function makeProducer({
	connect = () => Promise.resolve(),
	disconnect = () => Promise.resolve(),
	send = () => Promise.resolve(),
}: Partial<FakeProducer> = {}): FakeProducer {
	return {
		connect: mock(connect),
		disconnect: mock(disconnect),
		send: mock(send),
	};
}

let moduleId = 0;

async function loadProducer() {
	return import(`./producer.ts?test=${moduleId++}`);
}

const event = {
	browser_name: "Chrome",
	city: null,
	country: "US",
	device_type: "desktop",
	id: "1b0a8d41-1d8a-4c31-91e0-4b4fcb2d8b0d",
	ip_hash: "hash_123",
	link_id: "link_123",
	referrer: null,
	region: null,
	timestamp: "2026-05-07 12:00:00.000",
	user_agent: "Mozilla/5.0",
};

beforeEach(() => {
	delete process.env.REDPANDA_BROKER;
	delete process.env.REDPANDA_PASSWORD;
	delete process.env.REDPANDA_SSL;
	delete process.env.REDPANDA_USER;
	setAttributes.mockClear();
	captureError.mockClear();
	clickHouseInsert.mockClear();
	createProducer.mockClear();
	kafkaConfigs.length = 0;
	nextProducer = null;
});

describe("sendLinkVisit", () => {
	test("persists directly when Kafka is not configured", async () => {
		const { sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(result).toBe(true);
		expect(setAttributes).toHaveBeenLastCalledWith({
			clickhouse_fallback_success: true,
		});
		expect(clickHouseInsert).toHaveBeenCalledWith({
			format: "JSONEachRow",
			table: "analytics.link_visits",
			values: [event],
		});
	});

	test("rejects delivery when the direct fallback is unavailable", async () => {
		const error = new Error("clickhouse unavailable");
		clickHouseInsert.mockRejectedValueOnce(error);
		const { sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(result).toBe(false);
		expect(captureError).toHaveBeenCalledWith(error, {
			clickhouse_table: "analytics.link_visits",
			operation: "clickhouse_link_visit_fallback",
		});
	});

	test("uses native Kafka timeouts and enables TLS without SASL", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		process.env.REDPANDA_SSL = "true";
		nextProducer = makeProducer();
		const { disconnectProducer, sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(result).toBe(true);
		expect(kafkaConfigs).toEqual([
			expect.objectContaining({
				authenticationTimeout: 10_000,
				brokers: ["redpanda.test:9092"],
				connectionTimeout: 10_000,
				enforceRequestTimeout: true,
				requestTimeout: 10_000,
				ssl: true,
			}),
		]);
		expect(nextProducer.send).toHaveBeenCalledWith(
			expect.objectContaining({ acks: -1, timeout: 10_000 })
		);
		expect(kafkaConfigs[0]).not.toHaveProperty("sasl");

		await disconnectProducer();
		expect(nextProducer.disconnect).toHaveBeenCalledTimes(1);
	});

	test("shares one connection attempt across concurrent sends", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		let releaseConnect: (() => void) | undefined;
		nextProducer = makeProducer({
			connect: () =>
				new Promise<void>((resolve) => {
					releaseConnect = resolve;
				}),
		});
		const { disconnectProducer, sendLinkVisit } = await loadProducer();

		const sends = [
			sendLinkVisit(event, event.link_id),
			sendLinkVisit({ ...event, id: "second-event" }, event.link_id),
		];
		await Bun.sleep(0);
		expect(nextProducer.connect).toHaveBeenCalledTimes(1);
		releaseConnect?.();

		expect(await Promise.all(sends)).toEqual([true, true]);
		expect(nextProducer.send).toHaveBeenCalledTimes(2);
		await disconnectProducer();
	});

	test("disposes a producer whose connection fails before retry", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		const connectionError = new Error("connection failed");
		nextProducer = makeProducer({
			connect: () => Promise.reject(connectionError),
		});
		const { sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(nextProducer.disconnect).toHaveBeenCalledTimes(1);
		expect(result).toBe(true);
		expect(captureError).toHaveBeenCalledWith(connectionError, {
			operation: "kafka_connect",
		});
		expect(clickHouseInsert).toHaveBeenCalledTimes(1);
	});

	test("disposes a failed producer without falling back after an ambiguous send", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		const sendError = new Error("send failed");
		nextProducer = makeProducer({
			send: () => Promise.reject(sendError),
		});
		const { sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(nextProducer.disconnect).toHaveBeenCalledTimes(1);
		expect(result).toBe(false);
		expect(clickHouseInsert).not.toHaveBeenCalled();
		expect(captureError).toHaveBeenCalledWith(sendError, {
			kafka_topic: "analytics-link-visits",
			operation: "kafka_send",
		});
	});
});

describe("checkProducerHealth", () => {
	test("fails when Kafka is not configured", async () => {
		const { checkProducerHealth } = await loadProducer();

		await expect(checkProducerHealth()).rejects.toThrow(
			"Redpanda producer is unavailable"
		);
	});

	test("passes after connecting a producer", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		nextProducer = makeProducer();
		const { checkProducerHealth, disconnectProducer } = await loadProducer();

		await checkProducerHealth();

		expect(nextProducer.connect).toHaveBeenCalledTimes(1);
		await disconnectProducer();
	});
});
