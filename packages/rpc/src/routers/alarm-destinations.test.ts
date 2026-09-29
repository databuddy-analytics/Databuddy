import { describe, expect, test } from "bun:test";
import { alarmDestinationTypeValues } from "@databuddy/db/schema";
import { ALARM_DESTINATION_BUILDERS } from "@databuddy/notifications";
import { ALARM_DESTINATION_TYPES } from "@databuddy/shared/alarm-destinations";
import { destinationSchema } from "./alarms";

function sorted(values: Iterable<string>): string[] {
	return [...new Set(values)].sort();
}

describe("alarm destination type registry", () => {
	test("DB values, RPC discriminated union, and delivery builder handle the exact same set of types", () => {
		const canonical = sorted(ALARM_DESTINATION_TYPES);

		const dbTypes = sorted(alarmDestinationTypeValues);
		const rpcTypes = sorted(
			destinationSchema.options.map((option) => option.shape.type.value)
		);
		const deliveryTypes = sorted(Object.keys(ALARM_DESTINATION_BUILDERS));

		expect(dbTypes).toEqual(canonical);
		expect(rpcTypes).toEqual(canonical);
		expect(deliveryTypes).toEqual(canonical);
	});
});

describe("webhook destination header validation", () => {
	test("rejects a Content-Type header instead of silently dropping it at send time", () => {
		const result = destinationSchema.safeParse({
			type: "webhook",
			identifier: "https://example.com/hook",
			config: { headers: { "Content-Type": "application/xml" } },
		});
		expect(result.success).toBe(false);
	});

	test("rejects an X-Original-URL header instead of silently dropping it at send time", () => {
		const result = destinationSchema.safeParse({
			type: "webhook",
			identifier: "https://example.com/hook",
			config: { headers: { "X-Original-URL": "/admin" } },
		});
		expect(result.success).toBe(false);
	});

	test("accepts an allowed custom header", () => {
		const result = destinationSchema.safeParse({
			type: "webhook",
			identifier: "https://example.com/hook",
			config: { headers: { "X-Alarm": "keep-me" } },
		});
		expect(result.success).toBe(true);
	});
});
