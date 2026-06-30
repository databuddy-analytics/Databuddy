import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";
const CONVERSATIONAL_TOOLS_NOT_CALLED: string[] = [
	"get_data",
	"execute_sql_query",
	"search_memory",
	"save_memory",
	"forget_memory",
	"list_profiles",
	"get_profile",
	"get_profile_sessions",
	"list_funnels",
	"get_funnel_analytics",
	"get_funnel_analytics_by_referrer",
	"create_funnel",
	"list_goals",
	"get_goal_analytics",
	"create_goal",
	"update_goal",
	"delete_goal",
	"list_annotations",
	"create_annotation",
	"update_annotation",
	"delete_annotation",
	"list_links",
	"list_link_folders",
	"create_link",
	"update_link",
	"delete_link",
	"slack_read_current_thread",
	"slack_read_recent_channel_messages",
];

/**
 * Behavioral cases — edge cases testing reasoning boundaries, honest
 * acknowledgment of data limitations, nuanced statistical thinking,
 * graceful handling of impossible requests, and disambiguation of
 * ambiguous queries.
 */
export const behavioralCases: EvalCase[] = [
	{
		id: "conversational-greeting-no-tools",
		category: "behavioral",
		name: "Responds to a greeting without running analytics tools",
		query: "hi",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["conversation", "no-tools", "slack"],
		expect: {
			toolsNotCalled: CONVERSATIONAL_TOOLS_NOT_CALLED,
			responseNotContains: [
				"pageviews",
				"unique visitors",
				"sessions",
				"revenue",
			],
			maxSteps: 1,
			maxLatencyMs: 15_000,
		},
	},
	{
		id: "conversational-thanks-no-tools",
		category: "behavioral",
		name: "Responds to thanks without continuing the previous analysis",
		query: "thanks",
		websiteId: WS,
		surfaces: ["agent", "slack"],
		tags: ["conversation", "no-tools", "slack"],
		expect: {
			toolsNotCalled: CONVERSATIONAL_TOOLS_NOT_CALLED,
			responseNotContains: [
				"pageviews",
				"unique visitors",
				"sessions",
				"revenue",
			],
			maxSteps: 1,
			maxLatencyMs: 15_000,
		},
	},
	{
		id: "conversational-correction-no-tools",
		category: "behavioral",
		name: "Responds to a correction without reading thread or launching tools",
		query: "nah that's wrong",
		websiteId: WS,
		surfaces: ["slack"],
		tags: ["conversation", "no-tools", "slack", "correction"],
		expect: {
			toolsNotCalled: CONVERSATIONAL_TOOLS_NOT_CALLED,
			maxSteps: 1,
			maxLatencyMs: 15_000,
			maxResponseWords: 25,
			responseNotContains: ["pageviews", "sessions", "revenue"],
		},
	},
	{
		id: "slack-exact-copy-no-preamble",
		category: "behavioral",
		name: "Outputs exact copy in Slack without preamble or tools",
		query:
			"exact copy only: tell them the Slack app needs to be reinstalled for new scopes",
		websiteId: WS,
		surfaces: ["slack"],
		tags: ["conversation", "no-tools", "slack", "copy"],
		expect: {
			toolsNotCalled: CONVERSATIONAL_TOOLS_NOT_CALLED,
			maxSteps: 1,
			maxLatencyMs: 15_000,
			maxResponseWords: 25,
			responseNotMatches: [
				{
					description: "does not add rewrite preamble",
					pattern: "^(sure|okay|got it|here'?s|try this|option)",
				},
			],
			responseMatches: [
				{
					description: "mentions reinstalling Slack app for scopes",
					pattern:
						"Slack app.+reinstalled.+scopes|reinstalled.+Slack app.+scopes",
				},
			],
		},
	},
	{
		id: "slack-ambient-reaction-no-tools",
		category: "behavioral",
		name: "Does not force a report for ambient Slack chatter",
		query: "damn",
		websiteId: WS,
		surfaces: ["slack"],
		tags: ["conversation", "no-tools", "slack", "ambient"],
		expect: {
			toolsNotCalled: CONVERSATIONAL_TOOLS_NOT_CALLED,
			maxSteps: 1,
			maxLatencyMs: 15_000,
			maxResponseWords: 20,
			responseNotContains: ["pageviews", "sessions", "revenue", "report"],
		},
	},
	{
		id: "impossible-revenue-metrics",
		category: "behavioral",
		name: "Acknowledges revenue/financial data is unavailable and offers alternatives",
		query:
			"Show me the revenue per visitor for each traffic source and calculate our LTV:CAC ratio. We need this for the board deck by Friday.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 180_000,
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
			maxSteps: 20,
			maxLatencyMs: 180_000,
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
			maxSteps: 20,
			maxLatencyMs: 180_000,
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
			maxSteps: 20,
			maxLatencyMs: 180_000,
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
			maxSteps: 20,
			maxLatencyMs: 180_000,
		},
	},
];
