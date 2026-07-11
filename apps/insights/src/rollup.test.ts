import { describe, expect, it } from "bun:test";
import { buildDeterministicRollupNarrative } from "./rollup";

describe("buildDeterministicRollupNarrative", () => {
	it("does not infer health when no insights exist", () => {
		expect(buildDeterministicRollupNarrative("7d", [])).toBe(
			"No priority findings were stored this week."
		);
	});

	it("summarizes the top signal with site context", () => {
		const narrative = buildDeterministicRollupNarrative("30d", [
			{
				title: "Checkout errors increased",
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
				changePercent: null,
				websiteName: null,
				websiteDomain: "www.example.com",
			},
			{
				title: "Docs traffic improved",
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
