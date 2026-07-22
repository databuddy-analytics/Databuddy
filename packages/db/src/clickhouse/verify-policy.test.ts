import { describe, expect, test } from "bun:test";
import {
	isUnmanagedClickHouseObject,
	UNMANAGED_CLICKHOUSE_OBJECTS,
} from "./verify-policy";

describe("ClickHouse verification policy", () => {
	test("acknowledges only the retired web-vitals aggregate objects", () => {
		expect([...UNMANAGED_CLICKHOUSE_OBJECTS].sort()).toEqual([
			"analytics.web_vitals_hourly",
			"analytics.web_vitals_hourly_mv",
		]);
	});

	test("does not generically exempt untracked materialized views", () => {
		expect(isUnmanagedClickHouseObject("analytics.web_vitals_hourly_mv")).toBe(
			true
		);
		expect(isUnmanagedClickHouseObject("analytics.unknown_mv")).toBe(false);
	});
});
