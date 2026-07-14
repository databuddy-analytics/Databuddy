import { describe, expect, it } from "bun:test";
import type { GeneratedInsight } from "@databuddy/shared/insights";
import {
	visibleInsightText,
	visibleInsightWordCount,
	visibleTextWordCount,
} from "./insight-visible-output";

function insight(): GeneratedInsight {
	return {
		title: "Checkout errors increased",
		description: "Errors rose from 10 to 40 in the latest complete week.",
		suggestion:
			"No patch target is established yet. Reproduce checkout and trace its first application frame.",
		metrics: [
			{
				label: "Errors",
				current: 40,
				previous: 10,
				format: "number",
			},
		],
		severity: "critical",
		sentiment: "negative",
		priority: 9,
		changePercent: 300,
		subjectKey: "error_count",
		sources: ["ops"],
		confidence: 0.65,
		type: "error_spike",
		impactSummary: "Thirty additional errors were measured.",
		rootCause: "TypeError: checkout total was undefined.",
		evidence: [
			{
				type: "error",
				description: "The same fingerprint affected 21 sessions.",
			},
		],
	};
}

describe("visible insight output", () => {
	it("counts all customer-visible copy", () => {
		const value = insight();
		expect(visibleInsightText(value)).toContain(
			"Thirty additional errors were measured."
		);
		expect(visibleInsightText(value)).toContain(
			"TypeError: checkout total was undefined."
		);
		expect(visibleInsightWordCount(value)).toBe(45);
		expect(visibleTextWordCount(value.description)).toBe(11);
	});
});
