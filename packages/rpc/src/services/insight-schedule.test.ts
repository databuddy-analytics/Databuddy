import { describe, expect, it } from "bun:test";
import {
	getNextInsightRunAt,
	isValidCron,
	isValidTimezone,
} from "./insight-schedule";

describe("isValidCron", () => {
	it("accepts standard five-field expressions", () => {
		expect(isValidCron("0 8 * * 5")).toBe(true);
		expect(isValidCron("0 9 * * 1")).toBe(true);
		expect(isValidCron("*/15 * * * *")).toBe(true);
		expect(isValidCron("0,30 * * * *")).toBe(true);
	});

	it("trims surrounding whitespace before parsing", () => {
		expect(isValidCron("  0 8 * * 5  ")).toBe(true);
	});

	it("rejects expressions with the wrong number of fields", () => {
		expect(isValidCron("0 8 * *")).toBe(false);
		expect(isValidCron("0 8 * * 5 *")).toBe(false);
		expect(isValidCron("")).toBe(false);
	});

	it("rejects out-of-range numbers", () => {
		expect(isValidCron("60 0 * * *")).toBe(false);
		expect(isValidCron("0 24 * * *")).toBe(false);
		expect(isValidCron("0 0 32 * *")).toBe(false);
		expect(isValidCron("0 0 * 13 *")).toBe(false);
		expect(isValidCron("0 0 * * 8")).toBe(false);
	});

	it("rejects malformed tokens like letters or @aliases", () => {
		expect(isValidCron("@weekly")).toBe(false);
		expect(isValidCron("0 8 * * FRI")).toBe(false);
		expect(isValidCron("0 8 * * mon-fri")).toBe(false);
	});

	it("accepts numeric ranges in any field (e.g. weekdays 1-5)", () => {
		expect(isValidCron("0 9 * * 1-5")).toBe(true);
		expect(isValidCron("0 0-6 * * *")).toBe(true);
		expect(isValidCron("0 9 1-15 * *")).toBe(true);
		expect(isValidCron("0 9 * 1-6 *")).toBe(true);
	});

	it("accepts ranges combined with steps and comma lists", () => {
		expect(isValidCron("0 9 * * 1-5/2")).toBe(true);
		expect(isValidCron("0 0,12 * * *")).toBe(true);
		expect(isValidCron("0 9 * * 1-5,0")).toBe(true);
		expect(isValidCron("*/5 9-17 * * 1-5")).toBe(true);
	});

	it("rejects inverted or out-of-range ranges", () => {
		expect(isValidCron("0 9 * * 5-1")).toBe(false);
		expect(isValidCron("0 25-30 * * *")).toBe(false);
		expect(isValidCron("0 9 32-34 * *")).toBe(false);
	});
});

describe("isValidTimezone", () => {
	it("accepts common IANA names", () => {
		expect(isValidTimezone("Europe/Berlin")).toBe(true);
		expect(isValidTimezone("America/New_York")).toBe(true);
		expect(isValidTimezone("UTC")).toBe(true);
		expect(isValidTimezone("Asia/Singapore")).toBe(true);
	});

	it("rejects empty strings and unknown names", () => {
		expect(isValidTimezone("")).toBe(false);
		expect(isValidTimezone("GMT+2")).toBe(false);
		expect(isValidTimezone("Mars/Olympus")).toBe(false);
		expect(isValidTimezone("Europe/Atlantis")).toBe(false);
	});
});

describe("getNextInsightRunAt", () => {
	it("returns null when scheduling is disabled", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: false, frequency: "daily" },
			new Date("2026-01-15T10:30:00.000Z")
		);

		expect(next).toBeNull();
	});

	it("schedules hourly runs at the next top of hour", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: true, frequency: "hourly" },
			new Date("2026-01-15T10:30:22.000Z")
		);

		expect(next).toEqual(new Date("2026-01-15T11:00:00.000Z"));
	});

	it("schedules daily runs for today when before 9am", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: true, frequency: "daily", timezone: "UTC" },
			new Date("2026-01-15T08:30:00.000Z")
		);

		expect(next).toEqual(new Date("2026-01-15T09:00:00.000Z"));
	});

	it("schedules daily runs for 9am the next day after 9am", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: true, frequency: "daily", timezone: "UTC" },
			new Date("2026-01-15T10:30:00.000Z")
		);

		expect(next).toEqual(new Date("2026-01-16T09:00:00.000Z"));
	});

	it("schedules weekly runs for today when before 9am", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: true, frequency: "weekly", timezone: "UTC" },
			new Date("2026-01-15T08:30:00.000Z")
		);

		expect(next).toEqual(new Date("2026-01-15T09:00:00.000Z"));
	});

	it("schedules weekly runs seven days out after 9am", () => {
		const next = getNextInsightRunAt(
			{ cron: null, enabled: true, frequency: "weekly", timezone: "UTC" },
			new Date("2026-01-15T10:30:00.000Z")
		);

		expect(next).toEqual(new Date("2026-01-22T09:00:00.000Z"));
	});

	it("supports simple five-field cron expressions", () => {
		const next = getNextInsightRunAt(
			{
				cron: "*/15 * * * *",
				enabled: true,
				frequency: "custom",
				timezone: "UTC",
			},
			new Date("2026-01-15T10:01:45.000Z")
		);

		expect(next).toEqual(new Date("2026-01-15T10:15:00.000Z"));
	});

	it("supports sparse leap-day cron expressions", () => {
		const next = getNextInsightRunAt(
			{
				cron: "0 9 29 2 *",
				enabled: true,
				frequency: "custom",
				timezone: "UTC",
			},
			new Date("2026-01-15T10:01:45.000Z")
		);

		expect(next).toEqual(new Date("2028-02-29T09:00:00.000Z"));
	});

	it("returns null for invalid custom cron", () => {
		const next = getNextInsightRunAt(
			{ cron: "not cron", enabled: true, frequency: "custom" },
			new Date("2026-01-15T10:01:45.000Z")
		);

		expect(next).toBeNull();
	});

	it("rejects cron fields with trailing text", () => {
		const next = getNextInsightRunAt(
			{ cron: "1abc * * * *", enabled: true, frequency: "custom" },
			new Date("2026-01-15T10:01:45.000Z")
		);

		expect(next).toBeNull();
	});
});
