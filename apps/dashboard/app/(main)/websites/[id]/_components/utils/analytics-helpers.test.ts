import { describe, expect, it } from "bun:test";
import { calculatePreviousPeriod } from "./analytics-helpers";

describe("calculatePreviousPeriod", () => {
	it("compares a rolling 24 hour window with the 24 hours before it", () => {
		expect(
			calculatePreviousPeriod({
				start_date: "2026-10-05T18:00:00.000Z",
				end_date: "2026-10-06T18:00:00.000Z",
				granularity: "hourly",
			})
		).toEqual({
			start_date: "2026-10-04T18:00:00.000Z",
			end_date: "2026-10-05T18:00:00.000Z",
			granularity: "hourly",
		});
	});

	it("compares whole-day ranges with the same number of days before them", () => {
		expect(
			calculatePreviousPeriod({
				start_date: "2026-10-01",
				end_date: "2026-10-07",
				granularity: "daily",
			})
		).toEqual({
			start_date: "2026-09-24",
			end_date: "2026-09-30",
			granularity: "daily",
		});
	});
});
