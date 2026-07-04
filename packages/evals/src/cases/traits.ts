import type { EvalCase } from "../types";

const DASHBOARD_WS = "3ed1fce1-5a56-4cb6-a977-66864f6d18e3";

const TRAIT_EXPECTATIONS: EvalCase["expect"] = {
	maxSteps: 20,
	maxLatencyMs: 420_000,
	minQualityScore: 70,
};

export const traitCases: EvalCase[] = [
	{
		id: "free-vs-pro-plan-behavior",
		category: "attribution",
		tags: ["traits"],
		name: "Segments session behavior by the plan identity trait",
		query:
			"Compare how free plan users and pro plan users used the app over the last 30 days: sessions, bounce rate, session duration, and the top pages each group visits. Use the identified-user plan trait to segment, and state clearly how many identified users each segment covers.",
		websiteId: DASHBOARD_WS,
		expect: {
			...TRAIT_EXPECTATIONS,
			toolsCalled: ["get_data"],
			toolInputs: [{ tool: "get_data", includes: { field: "trait:plan" } }],
		},
	},
	{
		id: "plan-trait-coverage-honesty",
		category: "attribution",
		tags: ["traits"],
		name: "Quantifies how much traffic is actually segmentable by plan",
		query:
			"What share of our last-30-day sessions and visitors can actually be segmented by the plan trait? Quantify identified vs anonymous coverage, list which plan values exist and their profile counts, and say plainly whether plan-level behavioral conclusions are statistically safe yet.",
		websiteId: DASHBOARD_WS,
		expect: {
			...TRAIT_EXPECTATIONS,
			toolsCalled: ["list_profile_traits"],
		},
	},
	{
		id: "paid-plans-trait-segment-pages",
		category: "attribution",
		tags: ["traits"],
		name: "Filters product usage by a multi-value plan trait segment",
		query:
			"Which pages do our paying users (any paid plan, not free) spend their sessions on in the last 30 days, and how does their bounce rate compare to the site overall? Check which plan values exist before segmenting.",
		websiteId: DASHBOARD_WS,
		expect: {
			...TRAIT_EXPECTATIONS,
			toolsCalled: ["get_data", "list_profile_traits"],
			toolInputs: [{ tool: "get_data", includes: { field: "trait:plan" } }],
		},
	},
];
