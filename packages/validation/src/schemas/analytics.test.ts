import { describe, expect, it } from "bun:test";
import { MAX_FUTURE_MS, MIN_TIMESTAMP } from "../constants";
import {
	analyticsDateRangeSchema,
	analyticsEventSchema,
	resolveAnalyticsDateRange,
} from "./analytics";

describe("analyticsDateRangeSchema", () => {
	it("preserves an explicit range or uses an inclusive seven-calendar-day default", () => {
		const now = new Date("2026-04-11T12:00:00.000Z");
		expect(
			resolveAnalyticsDateRange(
				{ startDate: "2026-02-01", endDate: "2026-02-28" },
				now
			)
		).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
		expect(resolveAnalyticsDateRange({}, now)).toEqual({
			startDate: "2026-04-05",
			endDate: "2026-04-11",
		});
	});

	it("accepts a single-day range", () => {
		expect(
			analyticsDateRangeSchema.safeParse({
				startDate: "2026-03-01",
				endDate: "2026-03-01",
			}).success
		).toBe(true);
	});

	it("computes the default range in UTC across month boundaries", () => {
		expect(resolveAnalyticsDateRange({}, new Date("2026-03-03T00:30:00.000Z"))).toEqual(
			{ startDate: "2026-02-25", endDate: "2026-03-03" }
		);
		expect(
			resolveAnalyticsDateRange({}, new Date("2026-01-02T23:59:59.999Z"))
		).toEqual({ startDate: "2025-12-27", endDate: "2026-01-02" });
	});

	it.each([
		["impossible calendar date", { startDate: "2026-02-30", endDate: "2026-03-01" }],
		["start without end", { startDate: "2026-02-01" }],
		["end without start", { endDate: "2026-02-01" }],
		["reversed range", { startDate: "2026-03-02", endDate: "2026-03-01" }],
		["non-ISO date", { startDate: "last week", endDate: "2026-03-01" }],
	])("rejects %s", (_label, range) => {
		expect(analyticsDateRangeSchema.safeParse(range).success).toBe(false);
	});
});

const validEvent = {
	eventId: "test-id",
	name: "screen_view",
	path: "https://example.com/page",
	timestamp: Date.now(),
};

describe("analyticsEventSchema properties bounds", () => {
	it("rejects properties with too many keys", () => {
		const properties: Record<string, string> = {};
		for (let i = 0; i < 51; i++) {
			properties[`k${i}`] = "v";
		}
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			properties,
		});
		expect(result.success).toBe(false);
	});

	it("accepts properties at the key limit", () => {
		const properties: Record<string, string> = {};
		for (let i = 0; i < 50; i++) {
			properties[`k${i}`] = "v";
		}
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			properties,
		});
		expect(result.success).toBe(true);
	});

	it("rejects property keys longer than 128 characters", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			properties: { ["a".repeat(129)]: "value" },
		});
		expect(result.success).toBe(false);
	});

	it("rejects properties exceeding serialized size limit", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			properties: { bigval: "x".repeat(33_000) },
		});
		expect(result.success).toBe(false);
	});
});

describe("analyticsEventSchema referrer validation", () => {
	it("rejects arbitrary string referrers", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			referrer: "not-a-valid-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("analyticsEventSchema timestamp bounds", () => {
	it("accepts the minimum timestamp and null", () => {
		expect(
			analyticsEventSchema.safeParse({ ...validEvent, timestamp: MIN_TIMESTAMP })
				.success
		).toBe(true);
		expect(
			analyticsEventSchema.safeParse({ ...validEvent, timestamp: null }).success
		).toBe(true);
	});

	it("rejects timestamps before the year-2000 floor", () => {
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				timestamp: MIN_TIMESTAMP - 1,
			}).success
		).toBe(false);
	});

	it("allows small clock skew but rejects far-future timestamps", () => {
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				timestamp: Date.now() + MAX_FUTURE_MS - 60_000,
			}).success
		).toBe(true);
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				timestamp: Date.now() + MAX_FUTURE_MS + 60_000,
			}).success
		).toBe(false);
	});

	it("rejects fractional timestamps", () => {
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				timestamp: Date.now() + 0.5,
			}).success
		).toBe(false);
	});
});

describe("analyticsEventSchema path validation", () => {
	it.each([
		["https URL", "https://example.com/page"],
		["http localhost with port", "http://localhost:3000/page"],
	])("accepts %s", (_label, path) => {
		expect(
			analyticsEventSchema.safeParse({ ...validEvent, path }).success
		).toBe(true);
	});

	it.each([
		["relative path", "/page"],
		["non-http scheme", "javascript:alert(1)"],
		["bare IP host", "http://192.168.1.5:3000/page"],
		["free text", "not a url"],
	])("rejects %s", (_label, path) => {
		expect(
			analyticsEventSchema.safeParse({ ...validEvent, path }).success
		).toBe(false);
	});
});

describe("analyticsEventSchema resolution bounds", () => {
	it.each([
		["minimum", "240x240"],
		["maximum", "10000x10000"],
	])("accepts the %s resolution", (_label, resolution) => {
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				screen_resolution: resolution,
			}).success
		).toBe(true);
	});

	it.each([
		["below minimum width", "239x600"],
		["above maximum height", "1920x10001"],
		["malformed", "1920by1080"],
	])("rejects %s", (_label, resolution) => {
		expect(
			analyticsEventSchema.safeParse({
				...validEvent,
				screen_resolution: resolution,
			}).success
		).toBe(false);
	});
});
