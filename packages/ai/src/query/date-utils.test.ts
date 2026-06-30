import { describe, expect, it } from "vitest";
import { shiftDate, todayInTimeZone } from "./date-utils";

describe("shiftDate", () => {
	it("subtracts days across month boundaries", () => {
		expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
		expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
	});

	it("adds days", () => {
		expect(shiftDate("2026-05-31", 1)).toBe("2026-06-01");
	});
});

describe("todayInTimeZone", () => {
	const nearMidnightUtc = new Date("2026-05-31T23:30:00Z");

	it("resolves the local calendar day, not the UTC day, near midnight", () => {
		expect(todayInTimeZone("UTC", nearMidnightUtc)).toBe("2026-05-31");
		expect(todayInTimeZone("Asia/Tokyo", nearMidnightUtc)).toBe("2026-06-01");
		expect(todayInTimeZone("America/Los_Angeles", nearMidnightUtc)).toBe(
			"2026-05-31"
		);
	});

	it("falls back to the UTC date for an invalid timezone", () => {
		expect(todayInTimeZone("Not/AZone", new Date("2026-05-31T12:00:00Z"))).toBe(
			"2026-05-31"
		);
	});
});
