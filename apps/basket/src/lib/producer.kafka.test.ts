import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const originalEnv = {
	REDPANDA_BROKER: process.env.REDPANDA_BROKER,
	REDPANDA_PASSWORD: process.env.REDPANDA_PASSWORD,
	REDPANDA_USER: process.env.REDPANDA_USER,
	SELFHOST: process.env.SELFHOST,
};

process.env.SELFHOST = "false";
process.env.REDPANDA_BROKER = "localhost:9092";
process.env.REDPANDA_USER = "user";
process.env.REDPANDA_PASSWORD = "password";

const {
	mockCaptureError,
	mockClickHouseInsert,
	mockConnect,
	mockDisconnect,
	mockKafka,
	mockProducer,
	mockSend,
} = vi.hoisted(() => {
	const mockConnect = vi.fn(() => Promise.resolve());
	const mockDisconnect = vi.fn(() => Promise.resolve());
	const mockSend = vi.fn(() => Promise.reject(new Error("send failed")));
	const mockProducer = vi.fn(() => ({
		connect: mockConnect,
		disconnect: mockDisconnect,
		send: mockSend,
	}));
	const mockKafka = vi.fn(function Kafka() {
		return {
		producer: mockProducer,
		};
	});

	return {
		mockCaptureError: vi.fn(),
		mockClickHouseInsert: vi.fn(() => Promise.resolve()),
		mockConnect,
		mockDisconnect,
		mockKafka,
		mockProducer,
		mockSend,
	};
});

vi.mock("kafkajs", () => ({
	CompressionTypes: { GZIP: 1 },
	Kafka: mockKafka,
}));

vi.mock("@databuddy/db/clickhouse", () => ({
	clickHouse: {
		insert: mockClickHouseInsert,
	},
	TABLE_NAMES: {
		ai_traffic_spans: "analytics.ai_traffic_spans",
		blocked_traffic: "analytics.blocked_traffic",
		custom_events: "analytics.custom_events",
		error_spans: "analytics.error_spans",
		events: "analytics.events",
		link_visits: "analytics.link_visits",
		outgoing_links: "analytics.outgoing_links",
		web_vitals_spans: "analytics.web_vitals_spans",
	},
}));

vi.mock("@lib/tracing", () => ({
	captureError: mockCaptureError,
	record: (_name: string, fn: Function) => Promise.resolve().then(() => fn()),
}));

const { disconnect, disposeRuntime, getStats, runPromise, send } = await import(
	"./producer"
);

beforeEach(() => {
	mockCaptureError.mockClear();
	mockClickHouseInsert.mockClear();
});

afterAll(async () => {
	await disposeRuntime().catch(() => {});
	for (const [key, value] of Object.entries(originalEnv)) {
		if (value === undefined) {
			delete process.env[key];
			continue;
		}
		process.env[key] = value;
	}
});

describe("producer Kafka send failure handling", () => {
	test("falls back to direct ClickHouse writes and still disconnects on shutdown", async () => {
		await runPromise(
			send("analytics-events", {
				client_id: "ws_1",
				event_id: "event_1",
				timestamp: Date.now(),
			})
		);

		await runPromise(
			send("analytics-events", {
				client_id: "ws_1",
				event_id: "event_2",
				timestamp: Date.now(),
			})
		);

		const stats = await runPromise(getStats);

		expect(mockKafka).toHaveBeenCalledTimes(1);
		expect(mockProducer).toHaveBeenCalledTimes(1);
		expect(mockConnect).toHaveBeenCalledTimes(1);
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockClickHouseInsert).toHaveBeenCalledTimes(2);
		expect(stats?.sent).toBe(2);
		expect(stats?.connected).toBe(false);
		expect(stats?.failed).toBe(true);
		expect(stats?.failedCount).toBe(1);

		await runPromise(disconnect);

		expect(mockDisconnect).toHaveBeenCalledTimes(1);
	});
});
