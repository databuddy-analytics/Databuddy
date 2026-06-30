import { describe, expect, it } from "bun:test";
import { historyStateSuffix } from "./prompts";

describe("historyStateSuffix", () => {
	it("annotates a recovered insight with its resolution date", () => {
		expect(
			historyStateSuffix({
				status: "resolved",
				resolvedReason: "recovered",
				resolvedAt: new Date("2026-05-29T08:00:00.000Z"),
				recurrence: 1,
				hadResolvedHistory: false,
			})
		).toBe(" (recovered 2026-05-29)");
	});

	it("annotates a recovered insight without a date", () => {
		expect(
			historyStateSuffix({
				status: "resolved",
				resolvedReason: "recovered",
				resolvedAt: null,
				recurrence: 1,
				hadResolvedHistory: false,
			})
		).toBe(" (recovered)");
	});

	it("marks stale insights as gone quiet", () => {
		expect(
			historyStateSuffix({
				status: "resolved",
				resolvedReason: "stale",
				resolvedAt: new Date("2026-05-29T08:00:00.000Z"),
				recurrence: 4,
				hadResolvedHistory: false,
			})
		).toBe(" (went quiet)");
	});

	it("falls back to a generic resolved label when reason is missing", () => {
		expect(
			historyStateSuffix({
				status: "resolved",
				resolvedReason: null,
				resolvedAt: null,
				recurrence: 1,
				hadResolvedHistory: false,
			})
		).toBe(" (resolved)");
	});

	it("adds no suffix for a single open occurrence", () => {
		expect(
			historyStateSuffix({
				status: "open",
				resolvedReason: null,
				resolvedAt: null,
				recurrence: 1,
				hadResolvedHistory: false,
			})
		).toBe("");
	});

	it("reports recurrence for repeated open insights", () => {
		expect(
			historyStateSuffix({
				status: "open",
				resolvedReason: null,
				resolvedAt: null,
				recurrence: 3,
				hadResolvedHistory: false,
			})
		).toBe(" (reported 3x)");
	});

	it("flags open insights that previously resolved as intermittent", () => {
		expect(
			historyStateSuffix({
				status: "open",
				resolvedReason: null,
				resolvedAt: null,
				recurrence: 3,
				hadResolvedHistory: true,
			})
		).toBe(" (intermittent, 3x)");
	});
});
