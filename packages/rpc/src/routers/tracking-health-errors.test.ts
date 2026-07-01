import { describe, expect, it } from "bun:test";
import {
	CLICKHOUSE_TRACKING_HEALTH_TIMEOUT_MESSAGE,
	getTrackingHealthErrorLogLevel,
} from "./tracking-health-errors";

describe("getTrackingHealthErrorLogLevel", () => {
	it("downgrades canonical ClickHouse tracking health timeouts to warn", () => {
		expect(
			getTrackingHealthErrorLogLevel(
				new Error(CLICKHOUSE_TRACKING_HEALTH_TIMEOUT_MESSAGE)
			)
		).toBe("warn");
	});

	it("keeps non-timeout errors at error", () => {
		expect(getTrackingHealthErrorLogLevel(new Error("ClickHouse is down"))).toBe(
			"error"
		);
	});

	it("keeps non-Error values at error", () => {
		expect(getTrackingHealthErrorLogLevel("ClickHouse query timeout")).toBe(
			"error"
		);
	});
});
