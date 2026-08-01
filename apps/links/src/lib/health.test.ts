import { describe, expect, test } from "bun:test";
import { calculateLinkReadiness } from "./health";

const healthy = {
	clickhouse: "ok",
	deliveryQueue: "ok",
	postgres: "ok",
	redis: "ok",
	redpanda: "ok",
} as const;

describe("Links readiness", () => {
	test("stays ready when Redpanda is down but ClickHouse is available", () => {
		expect(
			calculateLinkReadiness({ ...healthy, redpanda: "error" })
		).toEqual({ httpStatus: 200, status: "degraded" });
	});

	test("stays ready when ClickHouse is down but Redpanda is available", () => {
		expect(
			calculateLinkReadiness({ ...healthy, clickhouse: "error" })
		).toEqual({ httpStatus: 200, status: "degraded" });
	});

	test("requires at least one available delivery sink", () => {
		expect(
			calculateLinkReadiness({
				...healthy,
				clickhouse: "error",
				redpanda: "error",
			})
		).toEqual({ httpStatus: 503, status: "unavailable" });
	});

	test("requires the durable queue admission path", () => {
		expect(
			calculateLinkReadiness({ ...healthy, deliveryQueue: "error" })
		).toEqual({ httpStatus: 503, status: "unavailable" });
	});

	test("accepts ClickHouse as the sole configured sink", () => {
		expect(
			calculateLinkReadiness({ ...healthy, redpanda: "disabled" })
		).toEqual({ httpStatus: 200, status: "ok" });
	});
});
