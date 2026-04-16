import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

/**
 * Behavioral cases — edge cases testing reasoning boundaries, honest
 * acknowledgment of data limitations, nuanced statistical thinking,
 * graceful handling of impossible requests, and disambiguation of
 * ambiguous queries.
 */
export const behavioralCases: EvalCase[] = [
	{
		id: "impossible-revenue-metrics",
		category: "behavioral",
		name: "Acknowledges revenue/financial data is unavailable and offers alternatives",
		query:
			"Show me the revenue per visitor for each traffic source and calculate our LTV:CAC ratio. We need this for the board deck by Friday.",
		websiteId: WS,
		expect: {
			maxSteps: 12,
			maxLatencyMs: 120_000,
		},
	},
	{
		id: "contradictory-growth-interpretation",
		category: "behavioral",
		name: "Identifies pageview inflation vs genuine growth and gives honest assessment",
		query:
			"Our pageviews went up 30% this month but unique visitors only went up 5%. The CEO says we're growing fast. Is he right? What's actually happening? Be honest even if the answer is bad news.",
		websiteId: WS,
		expect: {
			maxSteps: 12,
			maxLatencyMs: 120_000,
		},
	},
	{
		id: "statistical-significance-challenge",
		category: "behavioral",
		name: "Evaluates statistical significance of a small A/B-like change",
		query:
			"We changed our homepage headline last week. Pageviews went from 200/day to 220/day. The CEO says the new headline is a winner. Is this statistically significant or just noise? Do the math — I want to see confidence intervals or a significance test.",
		websiteId: WS,
		expect: {
			maxSteps: 12,
			maxLatencyMs: 120_000,
		},
	},
	{
		id: "attribution-model-limitations",
		category: "behavioral",
		name: "Acknowledges conversion/signup tracking gap and explains possible attribution",
		query:
			"Build me a complete attribution model showing which channels drive the most signups and calculate ROAS for each channel. Our Google Ads spend is $3000/mo and Facebook is $1500/mo.",
		websiteId: WS,
		expect: {
			maxSteps: 12,
			maxLatencyMs: 120_000,
		},
	},
	{
		id: "ambiguous-engagement-down",
		category: "behavioral",
		name: "Disambiguates vague 'engagement is down' claim and gives definitive answer",
		query:
			"Our marketing VP says 'engagement is down.' She didn't specify what engagement means or what timeframe. Figure out what she might mean, check the relevant metrics (bounce rate, pages/session, session duration, return visitors), and give me a definitive answer. Is engagement actually down? By what metric? Over what period? Don't hedge — give me a clear conclusion.",
		websiteId: WS,
		expect: {
			maxSteps: 12,
			maxLatencyMs: 120_000,
		},
	},
];
