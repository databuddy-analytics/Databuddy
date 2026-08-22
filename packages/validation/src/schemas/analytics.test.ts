import { describe, expect, it } from "bun:test";
import {
	analyticsDateRangeSchema,
	analyticsEventSchema,
} from "./analytics";

const validEvent = {
	eventId: "test-id",
	name: "screen_view",
	path: "https://example.com/page",
	timestamp: Date.now(),
};

describe("analyticsEventSchema properties bounds", () => {
	it("accepts valid properties", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			properties: { button: "signup", page: "home" },
		});
		expect(result.success).toBe(true);
	});

	it("accepts events without properties", () => {
		const result = analyticsEventSchema.safeParse(validEvent);
		expect(result.success).toBe(true);
	});

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
	it("accepts valid referrer URLs", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			referrer: "https://google.com",
		});
		expect(result.success).toBe(true);
	});

	it("accepts direct referrer", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			referrer: "direct",
		});
		expect(result.success).toBe(true);
	});

	it("accepts empty string referrer", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			referrer: "",
		});
		expect(result.success).toBe(true);
	});

	it("rejects arbitrary string referrers", () => {
		const result = analyticsEventSchema.safeParse({
			...validEvent,
			referrer: "not-a-valid-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("analyticsDateRangeSchema", () => {
	it("accepts a complete range", () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: "2026-01-01",
			endDate: "2026-01-31",
		});
		expect(result.success).toBe(true);
	});

	it("accepts no dates at all", () => {
		const result = analyticsDateRangeSchema.safeParse({});
		expect(result.success).toBe(true);
	});

	it("rejects a start date without an end date", () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: "2026-01-01",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"endDate is required when startDate is provided"
			);
		}
	});

	it("rejects an end date without a start date", () => {
		const result = analyticsDateRangeSchema.safeParse({
			endDate: "2026-01-31",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"startDate is required when endDate is provided"
			);
		}
	});

	it("rejects an inverted range", () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: "2026-02-01",
			endDate: "2026-01-31",
		});
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				"startDate must be on or before endDate"
			);
		}
	});

	it("accepts equal start and end dates", () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: "2026-01-31",
			endDate: "2026-01-31",
		});
		expect(result.success).toBe(true);
	});

	it("rejects non-ISO date strings", () => {
		const result = analyticsDateRangeSchema.safeParse({
			startDate: "01/2026",
			endDate: "2026-01-31",
		});
		expect(result.success).toBe(false);
	});
});
