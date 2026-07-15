import { describe, expect, it } from "bun:test";

process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.BULLMQ_REDIS_URL ??= process.env.REDIS_URL;
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret-for-insights-contract";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";

const { buildInsightLink, insightsRouter } = await import("./insights");

describe("insights compatibility contract", () => {
	it("keeps deprecated feed and dismissal paths routable", () => {
		expect(insightsRouter.feed["~orpc"].route.path).toBe("/insights/feed");
		expect(insightsRouter.setDismissed["~orpc"].route.path).toBe(
			"/insights/setDismissed"
		);
		expect(insightsRouter.clearDismissed["~orpc"].route.path).toBe(
			"/insights/clearDismissed"
		);
	});

	it("keeps historical investigation provenance in the output schema", () => {
		const history = insightsRouter.history["~orpc"].outputSchema.shape.insights;
		expect(Object.keys(history.element.shape)).toEqual(
			expect.arrayContaining(["chainId", "investigationDepth"])
		);
	});

	it("links revenue findings to the surface that can resolve them", () => {
		expect(buildInsightLink("site-1", "quality_shift", "revenue:usd")).toBe(
			"/websites/site-1/revenue"
		);
		expect(
			buildInsightLink(
				"site-1",
				"quality_shift",
				"payment_failure_rate:eur"
			)
		).toBe("/websites/site-1/revenue");
	});
});
