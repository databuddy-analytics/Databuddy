import { describe, expect, it } from "bun:test";
import { summarizeDigestConfig } from "./digest-summary";

describe("summarizeDigestConfig", () => {
	it("falls back to safe defaults when config is missing or wrong type", () => {
		const summary = summarizeDigestConfig(null);

		expect(summary).toEqual({
			channels: [],
			enabled: false,
			frequency: "weekly",
			nextRunAt: null,
			source: "default",
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

	it("accepts daily and weekly frequencies verbatim", () => {
		for (const freq of ["daily", "weekly"] as const) {
			expect(summarizeDigestConfig({ frequency: freq }).frequency).toBe(freq);
		}
	});

	it("normalizes timezone to a canonical type", () => {
		const summary = summarizeDigestConfig({
			timezone: "Europe/Berlin",
		});

		expect(summary.timezone).toBe("Europe/Berlin");
	});

	it("treats an empty timezone as absent", () => {
		const summary = summarizeDigestConfig({ timezone: "" });

		expect(summary.timezone).toBe("UTC");
	});

	it("serializes a Date nextRunAt to ISO string", () => {
		const summary = summarizeDigestConfig({
			nextRunAt: new Date("2026-06-12T06:00:00.000Z"),
		});

		expect(summary.nextRunAt).toBe("2026-06-12T06:00:00.000Z");
	});

	it("enables only an explicit true value", () => {
		expect(summarizeDigestConfig({ enabled: false }).enabled).toBe(false);
		expect(summarizeDigestConfig({ enabled: true }).enabled).toBe(true);
		expect(summarizeDigestConfig({}).enabled).toBe(false);
	});

	it("only accepts organization as a persisted source", () => {
		expect(summarizeDigestConfig({ source: "organization" }).source).toBe(
			"organization"
		);
		expect(summarizeDigestConfig({ source: "website" }).source).toBe("default");
		expect(summarizeDigestConfig({}).source).toBe("default");
	});
});
