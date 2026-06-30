import { describe, expect, it } from "bun:test";
import { INSIGHTS_JOB_TIMEOUT_MS } from "@databuddy/redis";
import {
	getInsightsMaintenanceIntervalMs,
	getInsightsStaleItemMs,
	summarizeItemErrors,
} from "./recovery";

describe("insights recovery config", () => {
	it("uses a five minute maintenance interval by default", () => {
		expect(getInsightsMaintenanceIntervalMs(undefined)).toBe(300_000);
	});

	it("rejects maintenance intervals below one minute", () => {
		expect(getInsightsMaintenanceIntervalMs("5000")).toBe(300_000);
	});

	it("uses a stale timeout above the BullMQ lock window by default", () => {
		expect(getInsightsStaleItemMs(undefined)).toBeGreaterThan(
			INSIGHTS_JOB_TIMEOUT_MS * 2
		);
	});

	it("rejects stale item timeouts below the worker retry window", () => {
		expect(getInsightsStaleItemMs(String(INSIGHTS_JOB_TIMEOUT_MS))).toBe(
			getInsightsStaleItemMs(undefined)
		);
	});
});

describe("summarizeItemErrors", () => {
	it("returns null when no failed items have error messages", () => {
		expect(summarizeItemErrors([])).toBeNull();
		expect(
			summarizeItemErrors([
				{ errorMessage: null, status: "failed" },
				{ errorMessage: "ignored", status: "succeeded" },
			])
		).toBeNull();
	});

	it("reports the single error with its count", () => {
		expect(
			summarizeItemErrors([
				{ errorMessage: "Model timeout", status: "failed" },
			])
		).toBe("1 item: Model timeout");
	});

	it("picks the most frequent error and counts other error types", () => {
		expect(
			summarizeItemErrors([
				{ errorMessage: "Model timeout", status: "failed" },
				{ errorMessage: "Model timeout", status: "failed" },
				{ errorMessage: "Rate limited", status: "failed" },
				{ errorMessage: "ignored", status: "succeeded" },
			])
		).toBe("2 items: Model timeout (+1 other error types)");
	});
});
