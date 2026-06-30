import { describe, expect, it } from "bun:test";
import type { Insight } from "@/lib/insight-types";
import { toInsightCardViewModel } from "./insight-card-view-model";

const baseInsight: Insight = {
	id: "insight_1",
	type: "vitals_degraded",
	severity: "warning",
	sentiment: "negative",
	priority: 8,
	websiteId: "web_1",
	websiteName: "Marketing",
	websiteDomain: "databuddy.cc",
	title: "Interactions got slower",
	description: "Visitors are waiting longer after clicking key controls.",
	suggestion: "Profile homepage JavaScript during real sessions.",
	metrics: [
		{ label: "Interaction delay", current: 104, previous: 96, format: "duration_ms" },
	],
	changePercent: 8.3,
	link: "/websites/web_1",
};

describe("insight card view model", () => {
	it("uses LLM-provided metric labels unchanged", () => {
		const view = toInsightCardViewModel(baseInsight);

		expect(view.headline).toBe("Interactions got slower");
		expect(view.metaLabel).toBe("Marketing");
		expect(view.primaryActionLabel).toBe("Review speed");
		expect(view.metrics[0]?.label).toBe("Interaction delay");
	});

	it("falls back to domain and default action when needed", () => {
		const view = toInsightCardViewModel({
			...baseInsight,
			type: "custom_event_spike",
			websiteName: null,
		});

		expect(view.metaLabel).toBe("databuddy.cc");
		expect(view.primaryActionLabel).toBe("Open analytics");
	});

	it("keeps investigation evidence separate from metric evidence", () => {
		const view = toInsightCardViewModel({
			...baseInsight,
			rootCause: "The homepage script bundle delayed hydration.",
			evidence: [
				{
					description: "LCP moved after the new checkout banner shipped.",
					type: "deploy_correlation",
				},
			],
		});

		expect(view.rootCause).toBe(
			"The homepage script bundle delayed hydration."
		);
		expect(view.investigationEvidence).toEqual([
			{
				description: "LCP moved after the new checkout banner shipped.",
				type: "deploy_correlation",
			},
		]);
		expect(view.metrics[0]?.label).toBe("Interaction delay");
	});
});
