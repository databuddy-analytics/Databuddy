import { describe, expect, it } from "bun:test";
import { buildDeterministicRollupNarrative } from "./rollup";

describe("buildDeterministicRollupNarrative", () => {
	it("returns a healthy fallback when no insights exist", () => {
		expect(buildDeterministicRollupNarrative("7d", [])).toBe(
			"All systems healthy this week. No actionable signals detected."
		);
	});

	it("summarizes the top signal with site context", () => {
		const narrative = buildDeterministicRollupNarrative("30d", [
			{
				title: "Checkout errors increased",
				description: "Errors rose on checkout.",
				suggestion: "Review checkout errors.",
				severity: "critical",
				sentiment: "negative",
				priority: 9,
				changePercent: 42,
				websiteName: "App",
				websiteDomain: "app.example.com",
			},
		]);

		expect(narrative).toBe(
			"This month: Checkout errors increased (+42%) on App."
		);
	});

	it("mentions an additional signal when multiple cards exist", () => {
		const narrative = buildDeterministicRollupNarrative("90d", [
			{
				title: "Interactions got slower",
				description: "INP regressed.",
				suggestion: "Audit slow pages.",
				severity: "warning",
				sentiment: "negative",
				priority: 8,
				changePercent: null,
				websiteName: null,
				websiteDomain: "www.example.com",
			},
			{
				title: "Docs traffic improved",
				description: "Organic sessions rose.",
				suggestion: "Compare landing pages.",
				severity: "info",
				sentiment: "positive",
				priority: 6,
				changePercent: 18,
				websiteName: "Docs",
				websiteDomain: "docs.example.com",
			},
		]);

		expect(narrative).toBe(
			"This quarter: Interactions got slower on www.example.com. Also review Docs traffic improved on Docs."
		);
	});
});
