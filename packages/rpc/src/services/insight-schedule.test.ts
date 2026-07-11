import { describe, expect, it } from "bun:test";
import {
	getNextInsightRunAt,
	isValidTimezone,
	normalizeInsightScheduleFrequency,
	normalizeInsightTimezone,
} from "./insight-schedule";

describe("isValidTimezone", () => {
	it("accepts IANA names and rejects invalid values", () => {
		expect(isValidTimezone("Europe/Berlin")).toBe(true);
		expect(isValidTimezone("America/New_York")).toBe(true);
		expect(isValidTimezone("UTC")).toBe(true);
		expect(isValidTimezone(" UTC ")).toBe(true);
		expect(isValidTimezone("")).toBe(false);
		expect(isValidTimezone("UT<C")).toBe(false);
		expect(isValidTimezone("GMT+2")).toBe(false);
		expect(isValidTimezone("Mars/Olympus")).toBe(false);
	});
});

describe("normalizeInsightTimezone", () => {
	it("canonicalizes whitespace and falls back for altered legacy values", () => {
		expect(normalizeInsightTimezone(" Europe/Berlin ")).toBe("Europe/Berlin");
		expect(normalizeInsightTimezone("UT<C")).toBe("UTC");
	});
});

describe("normalizeInsightScheduleFrequency", () => {
	it("keeps supported frequencies and safely downgrades legacy values", () => {
		expect(normalizeInsightScheduleFrequency("daily")).toBe("daily");
		expect(normalizeInsightScheduleFrequency("weekly")).toBe("weekly");
		expect(normalizeInsightScheduleFrequency("hourly")).toBe("weekly");
		expect(normalizeInsightScheduleFrequency("custom")).toBe("weekly");
	});
});

describe("getNextInsightRunAt", () => {
	it("returns null when scheduling is disabled", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: false, frequency: "daily" },
				new Date("2026-01-15T10:30:00.000Z")
			)
		).toBeNull();
	});

	it("schedules daily runs at 9am local time", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "UTC" },
				new Date("2026-01-15T08:30:00.000Z")
			)
		).toEqual(new Date("2026-01-15T09:00:00.000Z"));
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "UTC" },
				new Date("2026-01-15T10:30:00.000Z")
			)
		).toEqual(new Date("2026-01-16T09:00:00.000Z"));
	});

	it("schedules daily runs at 9am in a non-UTC timezone", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "Europe/Berlin" },
				new Date("2026-01-15T07:30:00.000Z")
			)
		).toEqual(new Date("2026-01-15T08:00:00.000Z"));
	});

	it("keeps daily runs at 9am across daylight-saving changes", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "Europe/Berlin" },
				new Date("2026-03-28T10:30:00.000Z")
			)
		).toEqual(new Date("2026-03-29T07:00:00.000Z"));
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "Europe/Berlin" },
				new Date("2026-10-24T10:30:00.000Z")
			)
		).toEqual(new Date("2026-10-25T08:00:00.000Z"));
	});

	it("schedules weekly runs seven days out after 9am", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "weekly", timezone: "UTC" },
				new Date("2026-01-15T10:30:00.000Z")
			)
		).toEqual(new Date("2026-01-22T09:00:00.000Z"));
	});

	it("keeps weekly runs at 9am across daylight-saving changes", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "weekly", timezone: "Europe/Berlin" },
				new Date("2026-03-22T10:30:00.000Z")
			)
		).toEqual(new Date("2026-03-29T07:00:00.000Z"));
	});

	it("uses UTC when a persisted timezone is invalid", () => {
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "Mars/Olympus" },
				new Date("2026-01-15T08:30:00.000Z")
			)
		).toEqual(new Date("2026-01-15T09:00:00.000Z"));
		expect(
			getNextInsightRunAt(
				{ enabled: true, frequency: "daily", timezone: "UT<C" },
				new Date("2026-01-15T08:30:00.000Z")
			)
		).toEqual(new Date("2026-01-15T09:00:00.000Z"));
	});
});
