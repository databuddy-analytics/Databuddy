import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";

const originalSelfHost = process.env.SELFHOST;
process.env.SELFHOST = "true";

const { mockCaptureError, mockClickHouseInsert } = vi.hoisted(() => ({
	mockCaptureError: vi.fn(),
	mockClickHouseInsert: vi.fn(() => Promise.resolve()),
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
		link_visits: "analytics.link_visits",
		events: "analytics.events",
		outgoing_links: "analytics.outgoing_links",
		web_vitals_spans: "analytics.web_vitals_spans",
	},
}));

vi.mock("@lib/tracing", () => ({
	captureError: mockCaptureError,
	record: (_name: string, fn: Function) => Promise.resolve().then(() => fn()),
}));

const {
	disposeRuntime,
	getStats,
	runPromise,
	send,
} = await import("./producer");

beforeEach(async () => {
	mockCaptureError.mockClear();
	mockClickHouseInsert.mockClear();
});

afterAll(async () => {
	await disposeRuntime().catch(() => {});
	if (originalSelfHost === undefined) {
		delete process.env.SELFHOST;
	} else {
		process.env.SELFHOST = originalSelfHost;
	}
});

describe("producer fallback topics", () => {
	test("blocked traffic is delivered through the direct ClickHouse fallback", async () => {
		await runPromise(
			send("analytics-blocked-traffic", {
				id: "blocked_1",
				client_id: "ws_1",
				timestamp: Date.now(),
			})
		);

		const stats = await runPromise(getStats);
		expect(stats?.errors).toBe(0);
		expect(stats?.sent).toBe(1);
		expect(mockClickHouseInsert).toHaveBeenCalledWith(
			expect.objectContaining({
				table: "analytics.blocked_traffic",
				values: [
					expect.objectContaining({ id: "blocked_1", client_id: "ws_1" }),
				],
			})
		);
	});

	test("unknown topics include the missing topic in error context", async () => {
		await expect(
			runPromise(
				send("analytics-unmapped-topic", {
					id: "evt_1",
					client_id: "ws_1",
					timestamp: Date.now(),
				})
			)
		).rejects.toMatchObject({
			_tag: "UnknownKafkaTopicError",
			retryable: false,
			topic: "analytics-unmapped-topic",
		});

		const stats = await runPromise(getStats);
		expect(stats?.errors).toBe(1);
		expect(mockCaptureError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Unknown Kafka topic" }),
			{ topic: "analytics-unmapped-topic" }
		);
	});
});
