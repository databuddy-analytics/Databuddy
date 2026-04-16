import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

/**
 * Tool-routing cases — multi-tool orchestration requiring cross-referencing
 * across different data sources, composite table construction, and session-level
 * analysis that cannot be answered with a single query.
 */
export const toolRoutingCases: EvalCase[] = [
	{
		id: "traffic-error-cross-reference",
		category: "tool-routing",
		name: "Cross-reference top pages by traffic with error rates in a single table",
		query:
			"Which of my top pages by traffic ALSO have the highest error rates? I want a single table showing: page, views, unique visitors, error count, error rate (errors/views as a %), and top error type. Only include pages with >50 views and >0 errors. Sort by error rate descending.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "session-level-funnel",
		category: "tool-routing",
		name: "Session-level multi-page funnel with path ordering and comparison",
		query:
			"How many unique sessions in the last 7 days included ALL of these pages: homepage, any /docs page, and /pricing? What was the most common order visitors hit those pages? What percentage of all sessions is this? Compare to sessions that hit /pricing WITHOUT seeing docs first — is there an engagement difference?",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "visitor-quality-scoring",
		category: "tool-routing",
		name: "Visitor quality segmentation by intent with source breakdown",
		query:
			"Build a visitor quality score: for visitors in the last 7 days, segment them into 'high intent' (visited /pricing OR /demo), 'research' (visited /docs OR /blog, >2 pages, >60s), and 'bounce' (1 page, <30s). What % falls into each bucket? How does this differ by traffic source? Which source produces the highest ratio of high-intent visitors?",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "realtime-anomaly-investigation",
		category: "tool-routing",
		name: "Real-time anomaly investigation comparing to same-day baseline",
		query:
			"Something seems wrong with our site RIGHT NOW. Check the last 24 hours: are error rates elevated? Are load times normal? Is traffic volume what you'd expect for this day/time? Compare to the same day last week. If anything is off, drill into exactly what changed — which pages, which sources, which devices.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "utm-campaign-effectiveness",
		category: "tool-routing",
		name: "UTM campaign effectiveness matrix with quality vs vanity distinction",
		query:
			"Analyze all UTM-tagged traffic in the last 30 days. For each campaign (utm_campaign): visitors, bounce rate, pages per session, avg session duration, and /pricing visit rate. Which campaigns are driving quality traffic vs vanity metrics? Are any campaigns actually hurting our bounce rate? Rank by a composite quality score, not just volume.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
];
