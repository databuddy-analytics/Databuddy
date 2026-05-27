import { describe, expect, test } from "bun:test";
import { insightSchema } from "./smart-insights-output";

const baseInsight = {
	title: "Pricing page traffic up 28%",
	description:
		"Pricing visitors grew while bounce rate improved and audience quality improved.",
	suggestion:
		"Review the journey from pricing into the next high-intent step.",
	metrics: [
		{
			label: "Pricing Page Visitors",
			current: 640,
			previous: 500,
			format: "number" as const,
		},
	],
	severity: "info" as const,
	sentiment: "positive" as const,
	priority: 6,
	type: "traffic_spike" as const,
	subjectKey: "pricing_page",
	sources: ["web" as const],
	confidence: 0.82,
};

describe("insightSchema", () => {
	test("accepts a valid insight", () => {
		const result = insightSchema.safeParse(baseInsight);
		expect(result.success).toBe(true);
	});

	test("accepts impactSummary when provided", () => {
		const result = insightSchema.safeParse({
			...baseInsight,
			impactSummary: "Revenue at risk if not addressed.",
		});
		expect(result.success).toBe(true);
	});

	test("requires at least one metric", () => {
		const result = insightSchema.safeParse({
			...baseInsight,
			metrics: [],
		});
		expect(result.success).toBe(false);
	});

	test("rejects more than 5 metrics", () => {
		const result = insightSchema.safeParse({
			...baseInsight,
			metrics: Array.from({ length: 6 }, (_, i) => ({
				label: `Metric ${i}`,
				current: i * 10,
				format: "number" as const,
			})),
		});
		expect(result.success).toBe(false);
	});
});
