import {
	resolveDatePreset,
	type DatePreset,
} from "@databuddy/ai/lib/date-presets";
import { describe, expect, it } from "vitest";

const presetCases = [
	["today", "2026-04-11", "2026-04-11", "2026-04-11"],
	["yesterday", "2026-04-11", "2026-04-10", "2026-04-10"],
	["last_7d", "2026-04-11", "2026-04-05", "2026-04-11"],
	["last_14d", "2026-04-11", "2026-03-29", "2026-04-11"],
	["last_30d", "2026-04-11", "2026-03-13", "2026-04-11"],
	["last_90d", "2026-04-11", "2026-01-12", "2026-04-11"],
	["this_week", "2026-04-08", "2026-04-05", "2026-04-08"],
	["last_week", "2026-04-08", "2026-03-29", "2026-04-04"],
	["this_month", "2026-04-15", "2026-04-01", "2026-04-15"],
	["last_month", "2026-04-15", "2026-03-01", "2026-03-31"],
	["last_month", "2026-03-15", "2026-02-01", "2026-02-28"],
	["this_year", "2026-04-11", "2026-01-01", "2026-04-11"],
] as const satisfies ReadonlyArray<
	readonly [DatePreset, date: string, from: string, to: string]
>;

function withTimezone(timezone: string, fn: () => void) {
	const previousTimezone = process.env.TZ;
	process.env.TZ = timezone;
	try {
		fn();
	} finally {
		if (previousTimezone) {
			process.env.TZ = previousTimezone;
		} else {
			delete process.env.TZ;
		}
	}
}

describe("resolveDatePreset", () => {
	for (const [preset, date, from, to] of presetCases) {
		it(`${preset} resolves correctly`, () => {
			const result = resolveDatePreset(
				preset,
				"UTC",
				new Date(`${date}T12:00:00Z`)
			);

			expect(result).toEqual({ from, to, startDate: from, endDate: to });
		});
	}

	it("uses the requested timezone at calendar boundaries", () => {
		withTimezone("America/Los_Angeles", () => {
			expect(
				resolveDatePreset("this_month", "UTC", new Date("2026-08-01T00:30:00Z"))
			).toMatchObject({ from: "2026-08-01", to: "2026-08-01" });
			expect(
				resolveDatePreset("last_month", "UTC", new Date("2026-08-01T00:30:00Z"))
			).toMatchObject({ from: "2026-07-01", to: "2026-07-31" });
			expect(
				resolveDatePreset("this_year", "UTC", new Date("2026-01-01T00:30:00Z"))
			).toMatchObject({ from: "2026-01-01", to: "2026-01-01" });
		});
	});

	it("falls back to today for an unknown preset", () => {
		expect(
			resolveDatePreset(
				"nonexistent" as DatePreset,
				"UTC",
				new Date("2026-04-11T12:00:00Z")
			)
		).toMatchObject({ from: "2026-04-11", to: "2026-04-11" });
	});
});
