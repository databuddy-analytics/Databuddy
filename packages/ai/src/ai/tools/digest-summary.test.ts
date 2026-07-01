import { describe, expect, it } from "bun:test";
import { summarizeDigestConfig } from "./digest-summary";

describe("summarizeDigestConfig", () => {
	it("falls back to safe defaults when config is missing or wrong type", () => {
		const summary = summarizeDigestConfig(null);

		expect(summary).toEqual({
			channels: [],
			cron: null,
			enabled: true,
			frequency: "weekly",
			nextRunAt: null,
			scope: "default",
			timezone: "UTC",
		});
	});

	it("extracts slack channels from deliveries and ignores other delivery types", () => {
		const summary = summarizeDigestConfig({
			deliveries: [
				{ type: "slack", channelId: "C111" },
				{ type: "email", channelId: "not-a-channel" },
				{ type: "slack", channelId: "C222" },
				{ type: "slack" },
			],
		});

		expect(summary.channels).toEqual(["C111", "C222"]);
	});

	it("coerces an unknown frequency to weekly", () => {
		const summary = summarizeDigestConfig({ frequency: "every-other-tuesday" });

		expect(summary.frequency).toBe("weekly");
	});

	it("accepts valid frequency values verbatim", () => {
		for (const freq of ["hourly", "daily", "weekly", "custom"] as const) {
			expect(summarizeDigestConfig({ frequency: freq }).frequency).toBe(freq);
		}
	});

	it("normalizes cron and timezone to canonical types", () => {
		const summary = summarizeDigestConfig({
			cron: "0 8 * * 5",
			timezone: "Europe/Berlin",
		});

		expect(summary.cron).toBe("0 8 * * 5");
		expect(summary.timezone).toBe("Europe/Berlin");
	});

	it("treats empty-string cron and timezone as absent", () => {
		const summary = summarizeDigestConfig({ cron: "", timezone: "" });

		expect(summary.cron).toBeNull();
		expect(summary.timezone).toBe("UTC");
	});

	it("serializes a Date nextRunAt to ISO string", () => {
		const summary = summarizeDigestConfig({
			nextRunAt: new Date("2026-06-12T06:00:00.000Z"),
		});

		expect(summary.nextRunAt).toBe("2026-06-12T06:00:00.000Z");
	});

	it("respects enabled=false but accepts unset as enabled=true", () => {
		expect(summarizeDigestConfig({ enabled: false }).enabled).toBe(false);
		expect(summarizeDigestConfig({}).enabled).toBe(true);
	});

	it("derives scope from source when present", () => {
		expect(summarizeDigestConfig({ source: "website" }).scope).toBe("website");
		expect(summarizeDigestConfig({}).scope).toBe("default");
	});
});
