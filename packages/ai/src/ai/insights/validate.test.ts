import { describe, expect, it } from "vitest";
import type { ParsedInsight } from "../schemas/smart-insights-output";
import { validateInsight, validateInsights } from "./validate";

const base: ParsedInsight = {
	title: "Error rate improves",
	description: "Error Rate improved while sessions stayed stable.",
	suggestion: "Inspect the remaining top error class and close the hotspot.",
	metrics: [
		{ label: "Error Rate", current: 4.39, previous: 4.71, format: "percent" },
	],
	severity: "warning",
	sentiment: "negative",
	priority: 7,
	type: "error_spike",
	changePercent: -6.8,
	subjectKey: "error_rate",
	sources: ["ops"],
	confidence: 0.9,
};

describe("validateInsight", () => {
	it("repairs improving error insights to positive reliability improvements", () => {
		const result = validateInsight(base);

		expect(result.insight).toMatchObject({
			sentiment: "positive",
			type: "reliability_improved",
			changePercent: -6.8,
		});
		expect(result.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining("repaired sentiment"),
				expect.stringContaining("repaired type"),
			])
		);
	});

	it("repairs changePercent from the primary metric", () => {
		const result = validateInsight({ ...base, changePercent: 12 });

		expect(result.insight?.changePercent).toBe(-6.8);
		expect(result.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining("repaired changePercent")])
		);
	});

	it("drops titles that contradict the primary metric direction", () => {
		const result = validateInsight({
			...base,
			title: "Cross-property dependency rises to 75.9%",
			description: "The dependency changed this week.",
			metrics: [
				{
					label: "Cross-property Traffic Share",
					current: 75.85,
					previous: 79.24,
					format: "percent",
				},
			],
			type: "cross_property_dependency",
			sentiment: "neutral",
			changePercent: -5.75,
		});

		expect(result.insight).toBeNull();
		expect(result.warnings.join("\n")).toContain("title direction contradicts");
	});

	it("allows mixed-direction titles when the primary metric direction is correct", () => {
		const result = validateInsight({
			...base,
			title: "Onboarding funnel entries +81% but conversion slips",
			description: "Funnel Entries rose while Conversion Rate slipped.",
			metrics: [
				{
					label: "Onboarding Funnel Entries",
					current: 67,
					previous: 37,
					format: "number",
				},
				{
					label: "Onboarding Conversion Rate",
					current: 7.46,
					previous: 8.11,
					format: "percent",
				},
			],
			type: "conversion_leak",
			sentiment: "negative",
			changePercent: 81.1,
		});

		expect(result.insight).toMatchObject({
			title: "Onboarding funnel entries +81% but conversion slips",
			changePercent: 81.1,
		});
	});

	it("treats rising vitals latency as negative", () => {
		const result = validateInsight({
			...base,
			title: "Interactions getting slower",
			description: "INP p75 worsened this week.",
			metrics: [
				{ label: "INP p75", current: 104, previous: 96, format: "duration_ms" },
			],
			type: "vitals_degraded",
			sentiment: "positive",
			changePercent: 8.3,
		});

		expect(result.insight).toMatchObject({
			sentiment: "negative",
			type: "vitals_degraded",
			changePercent: 8.3,
		});
	});

	it("drops technical jargon in titles", () => {
		const result = validateInsight({
			...base,
			title: "INP p75 regression",
			description: "Interaction latency worsened this week.",
			suggestion: "Profile homepage JavaScript during real sessions.",
			metrics: [
				{ label: "INP p75", current: 104, previous: 96, format: "duration_ms" },
			],
			type: "vitals_degraded",
			sentiment: "negative",
			changePercent: 8.3,
		});

		expect(result.insight).toBeNull();
		expect(result.warnings.join("\n")).toContain("technical jargon");
	});

	it("drops generic monitoring advice", () => {
		const result = validateInsight({
			...base,
			suggestion: "Monitor this closely over the next week.",
		});

		expect(result.insight).toBeNull();
		expect(result.warnings.join("\n")).toContain("generic monitoring");
	});

	it("drops unsupported revenue impact claims without business data", () => {
		const result = validateInsight({
			...base,
			title: "Pricing traffic creates revenue upside",
			description: "Pricing Page Visitors rose and should create revenue upside.",
			suggestion: "Inspect the pricing path and compare conversion quality.",
			sources: ["web"],
		});

		expect(result.insight).toBeNull();
		expect(result.warnings.join("\n")).toContain("business impact claim");
	});

	it("drops overstated attribution causality", () => {
		const result = validateInsight({
			...base,
			title: "Twitter caused engagement drop",
			description:
				"Engagement dropped because of the Twitter referrer mix shift.",
			suggestion: "Segment Twitter sessions against other referrers to verify.",
			type: "referrer_change",
			sources: ["web"],
			confidence: 0.65,
		});

		expect(result.insight).toBeNull();
		expect(result.warnings.join("\n")).toContain("causality is overstated");
	});
});

describe("validateInsights", () => {
	it("returns only valid repaired insights", () => {
		const result = validateInsights([
			base,
			{
				...base,
				title: "Dependency rises",
				metrics: [
					{
						label: "Cross-property Traffic Share",
						current: 75,
						previous: 80,
						format: "percent",
					},
				],
			},
		]);

		expect(result.insights).toHaveLength(1);
		expect(result.insights[0]?.type).toBe("reliability_improved");
		expect(result.warnings.length).toBeGreaterThan(0);
	});
});
