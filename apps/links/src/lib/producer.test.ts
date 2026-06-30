import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.CLICKHOUSE_URL = "http://clickhouse.test";
delete process.env.REDPANDA_BROKER;

const insert = mock(() => Promise.resolve());
const setAttributes = mock(() => {});
const captureError = mock(() => {});

mock.module("@databuddy/db/clickhouse", () => ({
	clickHouse: { insert },
	TABLE_NAMES: { link_visits: "analytics.link_visits" },
}));

mock.module("./logging", () => ({
	captureError,
	setAttributes,
}));

const { sendLinkVisit } = await import("./producer");

const event = {
	browser_name: "Chrome",
	city: null,
	country: "US",
	device_type: "desktop",
	ip_hash: "hash_123",
	link_id: "link_123",
	referrer: null,
	region: null,
	timestamp: "2026-05-07 12:00:00.000",
	user_agent: "Mozilla/5.0",
};

beforeEach(() => {
	insert.mockClear();
	setAttributes.mockClear();
	captureError.mockClear();
});

describe("sendLinkVisit", () => {
	test("falls back to ClickHouse when Kafka is not configured", async () => {
		const result = await sendLinkVisit(event, event.link_id);

		expect(result).toEqual({
			clickhouse_fallback_success: true,
			kafka_broker_configured: false,
			kafka_connected: false,
			kafka_send_ambiguous: false,
			kafka_send_skipped: true,
			kafka_send_success: false,
		});
		expect(insert).toHaveBeenCalledWith({
			table: "analytics.link_visits",
			values: [event],
			format: "JSONEachRow",
		});
		expect(setAttributes).toHaveBeenCalledWith({ kafka_send_skipped: true });
		expect(setAttributes).toHaveBeenCalledWith({
			clickhouse_fallback_success: true,
		});
	});

	test("reports ClickHouse fallback failures", async () => {
		insert.mockImplementationOnce(() => Promise.reject(new Error("insert failed")));

		const result = await sendLinkVisit(event, event.link_id);

		expect(result.clickhouse_fallback_success).toBe(false);
		expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
			operation: "clickhouse_link_visit_fallback",
			clickhouse_table: "analytics.link_visits",
		});
		expect(setAttributes).toHaveBeenCalledWith({
			clickhouse_fallback_success: false,
		});
	});
});
