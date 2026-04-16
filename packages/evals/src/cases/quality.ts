import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

/**
 * Quality cases — brutally hard analytical questions requiring multi-source
 * synthesis, quantified conclusions, causal reasoning, baseline comparisons,
 * and prioritized recommendations with estimated impact. A great agent should
 * score ~50-60%; a mediocre one ~30%.
 */
export const qualityCases: EvalCase[] = [
	{
		id: "funnel-leak-revenue-impact",
		category: "quality",
		name: "Funnel leak analysis with quantified opportunity cost",
		query:
			"Trace the EXACT path from organic Google traffic to /pricing. What percentage makes it? Where do they drop off? For the ones who drop off, what page do they go to instead? Quantify the opportunity cost: if we reduced drop-off at the worst leak by 50%, how many more pricing page visits per month would we get? Show the funnel with exact numbers at each step.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "content-roi-attribution",
		category: "quality",
		name: "Blog ROI with pipeline attribution and session-depth comparison",
		query:
			"I need a data-backed answer to 'should we keep investing in our blog?' For each blog post in the last 30 days: how many views, what % of blog readers visit a product page within the same session, what's the avg session depth for blog-entry vs homepage-entry visitors. Calculate blog's contribution to our pricing page pipeline as a percentage. Give me a final YES or NO recommendation with the math.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "weekend-vs-weekday-deep-dive",
		category: "quality",
		name: "Weekend vs weekday complete audience comparison with recommendation",
		query:
			"I've been told we should run weekend campaigns but I'm skeptical. Give me the COMPLETE picture: weekday vs weekend traffic volume, engagement quality (bounce, pages/session, time), source mix, device mix, page popularity, and geographic distribution. Is the weekend audience actually different or just smaller? Give me a specific yes/no recommendation on weekend campaigns with data backing every claim.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "mobile-performance-crisis",
		category: "quality",
		name: "Mobile CWV crisis assessment with bounce correlation and visitor loss estimate",
		query:
			"Our mobile Core Web Vitals are supposedly bad. Quantify exactly HOW bad: p75 LCP, CLS, INP, FCP for mobile vs desktop. Which specific pages are the worst offenders on mobile? Is there a correlation between mobile load time and mobile bounce rate on those pages? Estimate how many visitors we're losing per week due to poor mobile performance — show your methodology.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "geographic-expansion-matrix",
		category: "quality",
		name: "International expansion priority matrix with composite scoring",
		query:
			"Build me a priority matrix for international expansion. For each country in our top 15 by traffic: total visitors, engagement score (composite of bounce, session duration, pages/session), device split, page load performance, and growth trend (this month vs last). Score each country 1-10 on market readiness. Which 3 should we target first and why? Present as a sortable table.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "error-business-impact",
		category: "quality",
		name: "Error impact quantification with user journey disruption analysis",
		query:
			"Don't just show me errors — quantify their BUSINESS impact. For each error type in the last 14 days: how many unique users affected, on which pages, what were those users doing before the error (what page were they on), did they leave after the error or continue? Calculate the total sessions disrupted as a % of all sessions. Prioritize fixes by impact.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "competitor-intelligence-synthesis",
		category: "quality",
		name: "External competitor research cross-referenced with internal behavioral shifts",
		query:
			"Our competitor (Plausible Analytics) just shipped a major update. Search for recent news about it. Then analyze our own data: has our traffic pattern changed in the last 2 weeks? Any shift in direct vs organic vs referral? Any change in visitor behavior (are people spending less time, viewing fewer pages)? I need both the external context AND our internal data synthesized into a single assessment: should we be worried?",
		websiteId: WS,
		expect: {
			toolsCalled: ["web_search"],
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "full-stack-acquisition-audit",
		category: "quality",
		name: "Acquisition audit ranking sources by quality with investment recommendation",
		query:
			"Audit our entire acquisition strategy. For each traffic source (organic, direct, referral, social, paid): volume trend over 30 days, engagement quality (bounce rate, pages/session, session duration), which pages they land on, how deep they go, and their pricing-page visit rate. Rank sources by QUALITY not just volume. Which source is our best investment? Show your math — I want to see the composite scoring methodology.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "page-level-scorecard-priorities",
		category: "quality",
		name: "Top-20 page scorecard with content vs technical diagnosis and fix priorities",
		query:
			"For our top 20 pages by traffic: create a scorecard showing views, bounce rate, avg time on page, load time, and CWV scores. Flag any page that's underperforming on 2+ metrics. For flagged pages, determine if the problem is content (high traffic + high bounce + low time) or technical (bad vitals + high bounce). Prioritize fixes by traffic volume * severity. Give me an ordered list of exactly what to fix first.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
	{
		id: "seasonal-pattern-prediction",
		category: "quality",
		name: "90-day pattern detection with magnitude quantification and schedule recommendation",
		query:
			"Analyze our traffic patterns across the last 90 days. Are there consistent day-of-week patterns? Time-of-day patterns? Any multi-week trends? Identify the 3 strongest patterns, quantify their magnitude (peak vs trough as a %), and tell me exactly how I should adjust my publishing/marketing schedule to match. Be specific — which days, which hours, which weeks.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
		},
	},
];
