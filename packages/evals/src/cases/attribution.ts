import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

const HARD_ATTRIBUTION_EXPECTATIONS: EvalCase["expect"] = {
	maxSteps: 20,
	maxLatencyMs: 420_000,
	minQualityScore: 70,
	toolsCalled: ["execute_sql_query"],
};

/**
 * Attribution cases -- the hardest analyst-grade questions. These are designed
 * to punish fabricated certainty, unsupported causal claims, and shallow
 * single-touch reporting. A good answer should separate observed attribution
 * from incrementality, quantify missing identity/session coverage, state
 * denominators and windows, and refuse to allocate unattributable revenue.
 */
export const attributionCases: EvalCase[] = [
	{
		id: "multi-touch-revenue-model-comparison",
		category: "attribution",
		name: "Compares first-touch, last-touch, last non-direct, linear, time-decay, and position-based attribution",
		query:
			"Build the most rigorous revenue attribution view you can for the last 30 days. Compare first-touch, last-touch, last non-direct, linear, time-decay, and position-based attribution across source/referrer/utm_source. Show attributed revenue, transactions, and share for each model, then explain where the channel rankings disagree and why. Do not allocate revenue that lacks enough session or visitor context -- quantify it separately as unattributed.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "revenue-identity-gap-audit",
		category: "attribution",
		name: "Audits session and visitor identity coverage for revenue attribution",
		query:
			"Our weekly revenue number looks strong, but I don't trust the attribution. Audit the last 30 days of revenue identity coverage: what percent of revenue and transactions have session_id, anonymous_id, referrer, utm_source, utm_campaign, country, device, and entry page context? Which fields are missing most often? Which attribution cuts are safe, which are misleading, and exactly what instrumentation should we fix first?",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "incrementality-vs-attribution-twitter",
		category: "attribution",
		name: "Separates observed Twitter attribution from incremental demand",
		query:
			"Twitter drove a big traffic surge. Did it create incremental demand or just steal/shift demand from direct, organic, and referral? Compare Twitter sessions against a same-day-of-week baseline, check whether direct/organic declined when Twitter rose, compare downstream quality (/pricing, /demo, custom conversion events, revenue if attributable), and give a defensible conclusion. Be explicit about what would require a holdout or geo experiment.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "assisted-content-conversion-paths",
		category: "attribution",
		name: "Measures assisted conversion contribution from docs and blog content",
		query:
			"Which docs/blog pages are assisting conversions, not just getting traffic? For each docs/blog page in the last 30 days, calculate: entry sessions, same-session /pricing or /demo visits, later-session /pricing or /demo visits within 7 days by the same anonymous_id, revenue within 7 days if attributable, and assisted conversion rate. Separate landing-page influence from mid-journey assists. If cross-session identity is too sparse, say so and quantify coverage.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "markov-removal-effect-path-attribution",
		category: "attribution",
		name: "Estimates path removal effect instead of ranking channels by raw volume",
		query:
			"Use path-based attribution to find which sources/pages matter most. Build session paths at the level source/referrer -> entry page -> key content group -> /pricing or /demo -> conversion/revenue. Estimate each channel or content group's removal effect on conversions/revenue. If there is not enough data for a full Markov model, approximate carefully and label the method. Do not present raw volume ranking as removal effect.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "cohort-ltv-payback-by-source",
		category: "attribution",
		name: "Builds cohort LTV and payback by acquisition source with spend caveats",
		query:
			"For visitors acquired in the last 90 days, cohort them by first-touch source/utm_source and acquisition week. For each cohort, calculate D0, D7, and D30 revenue per visitor, conversion rate, repeat revenue, retention proxy, and payback period if spend data is available. If spend is missing, compute LTV only and state exactly what CAC/payback cannot be answered.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "simpsons-paradox-conversion-attribution",
		category: "attribution",
		name: "Detects segment-level reversals hidden by aggregate conversion gains",
		query:
			"Overall pricing/demo conversion looks up this month. Prove whether this is real or a Simpson's paradox from traffic mix changes. Break conversion rate by source, device, country, and new vs returning visitors for this month vs previous month. Show whether the aggregate lift remains after controlling for mix. If it disappears, identify which mix shift created the illusion.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "attribution-reconciliation-conflict",
		category: "attribution",
		name: "Reconciles conflicting revenue attribution cuts and explains definitions",
		query:
			"Revenue by UTM source, revenue by referrer, revenue by entry page, and total revenue do not seem to reconcile. Build a reconciliation table for the last 30 days: total revenue, revenue with attribution context, revenue missing attribution context, direct/none bucket, and each attribution cut's coverage. Explain why totals differ and which table a founder should use for channel investment decisions.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "paid-search-cannibalization-readout",
		category: "attribution",
		name: "Checks whether paid search cannibalizes organic/direct demand",
		query:
			"Assume we increased paid search spend this month. Use the data we have to test whether paid search is incremental or cannibalizing organic/direct demand. Compare paid-search-tagged traffic to organic/direct baselines, branded vs non-branded landing behavior if inferable, downstream conversion quality, and attributable revenue. Give a CFO-safe answer: what can we conclude, what can we not conclude, and what experiment would settle it?",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
	{
		id: "bot-spam-attribution-contamination",
		category: "attribution",
		name: "Detects whether a channel spike is contaminating attribution with low-quality traffic",
		query:
			"One referral/source appears to be driving a lot of traffic. Determine whether it is real demand or bot/spam contamination before we give it attribution credit. Check session depth, duration, bounce, event diversity, country/device/browser concentration, repeated paths, conversion/revenue contribution, and anomaly vs baseline. Recommend whether to include, downweight, or exclude it from attribution reporting.",
		websiteId: WS,
		expect: HARD_ATTRIBUTION_EXPECTATIONS,
	},
];
