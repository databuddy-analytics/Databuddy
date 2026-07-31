import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const setAttributes = mock(() => {});
const captureError = mock(() => {});
const mergeWideEvent = mock(() => {});
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
	createProducer.mockClear();
	kafkaConfigs.length = 0;
	nextProducer = null;
});

describe("sendLinkVisit", () => {
	test("reports an unavailable broker when Kafka is not configured", async () => {
		const { sendLinkVisit } = await loadProducer();

		const result = await sendLinkVisit(event, event.link_id);

		expect(result).toBe(false);
		expect(setAttributes).toHaveBeenLastCalledWith({
			kafka_connected: false,
			kafka_send_skipped: true,
		});
	});

	test("uses bounded native Kafka timeouts and enables TLS without SASL", async () => {
		process.env.REDPANDA_BROKER = "redpanda.test:9092";
		process.env.REDPANDA_SSL = "true";
		nextProducer = makeProducer();
		const { disconnectProducer, sendLinkVisit } = await loadProducer();
		const clearTimeoutSpy = spyOn(globalThis, "clearTimeout");

		try {
			const result = await sendLinkVisit(event, event.link_id);

			expect(result).toBe(true);
			expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
			expect(kafkaConfigs).toEqual([
				expect.objectContaining({
					authenticationTimeout: 3000,
					brokers: ["redpanda.test:9092"],
					connectionTimeout: 3000,
					enforceRequestTimeout: true,
					requestTimeout: 3000,
					ssl: true,
				}),
			]);
			expect(nextProducer.send).toHaveBeenCalledWith(
				expect.objectContaining({ acks: -1 })
			);
			expect(kafkaConfigs[0]).not.toHaveProperty("sasl");
		} finally {
			clearTimeoutSpy.mockRestore();
		}

		await disconnectProducer();
		expect(nextProducer.disconnect).toHaveBeenCalledTimes(1);
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
		expect(result).toBe(false);
		expect(captureError).toHaveBeenCalledWith(connectionError, {
			operation: "kafka_connect",
		});
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
		expect(captureError).toHaveBeenCalledWith(sendError, {
			kafka_topic: "analytics-link-visits",
			operation: "kafka_send",
		});
	});
});
