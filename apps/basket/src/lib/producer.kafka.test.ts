import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const originalEnv = {
	REDPANDA_BROKER: process.env.REDPANDA_BROKER,
	REDPANDA_PASSWORD: process.env.REDPANDA_PASSWORD,
	REDPANDA_USER: process.env.REDPANDA_USER,
	SELFHOST: process.env.SELFHOST,
};

process.env.SELFHOST = "false";
process.env.REDPANDA_BROKER = "localhost:9092";
delete process.env.REDPANDA_USER;
delete process.env.REDPANDA_PASSWORD;

const {
	mockCaptureError,
	mockAdmin,
	mockAdminConnect,
	mockAdminDescribeCluster,
	mockAdminDisconnect,
	mockClickHouseInsert,
	mockConnect,
	mockDisconnect,
	mockKafka,
	mockProducer,
	mockSend,
} = vi.hoisted(() => {
	const mockAdminConnect = vi.fn(() => Promise.resolve());
	const mockAdminDescribeCluster = vi.fn(() =>
		Promise.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" })
	);
	const mockAdminDisconnect = vi.fn(() => Promise.resolve());
	const mockAdmin = vi.fn(() => ({
		connect: mockAdminConnect,
		describeCluster: mockAdminDescribeCluster,
		disconnect: mockAdminDisconnect,
	}));
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
			admin: mockAdmin,
			producer: mockProducer,
		};
	});

	return {
		mockAdmin,
		mockAdminConnect,
		mockAdminDescribeCluster,
		mockAdminDisconnect,
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
	test("falls back directly during reconnect cooldown after an ambiguous Kafka send", async () => {
		await expect(
			runPromise(
				send("analytics-events", {
					client_id: "ws_1",
					event_id: "event_1",
					timestamp: Date.now(),
				})
			)
		).rejects.toMatchObject({ _tag: "KafkaSendError" });

		await expect(
			runPromise(
				send("analytics-events", {
					client_id: "ws_1",
					event_id: "event_2",
					timestamp: Date.now(),
				})
			)
		).resolves.toBeUndefined();

		const stats = await runPromise(getStats);

		expect(mockKafka).toHaveBeenCalledTimes(1);
		expect(mockKafka).toHaveBeenCalledWith(
			expect.objectContaining({
				brokers: ["localhost:9092"],
				clientId: "basket",
			})
		);
		expect(mockKafka.mock.calls[0]?.[0]).not.toHaveProperty("sasl");
		expect(mockProducer).toHaveBeenCalledTimes(1);
		expect(mockAdmin).toHaveBeenCalledTimes(1);
		expect(mockAdmin).toHaveBeenCalledWith(
			expect.objectContaining({ retry: expect.objectContaining({ retries: 0 }) })
		);
		expect(mockAdminConnect).not.toHaveBeenCalled();
		expect(mockAdminDescribeCluster).not.toHaveBeenCalled();
		expect(mockConnect).toHaveBeenCalledTimes(1);
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockClickHouseInsert).toHaveBeenCalledTimes(1);
		expect(stats?.sent).toBe(1);
		expect(stats?.connected).toBe(false);
		expect(stats?.failed).toBe(true);
		expect(stats?.failedCount).toBe(1);

		await runPromise(disconnect);

		expect(mockDisconnect).toHaveBeenCalledTimes(1);
		expect(mockAdminDisconnect).not.toHaveBeenCalled();
	});
});
