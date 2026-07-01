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
	{
		id: "product-usage-interesting-sessions",
		category: "tool-routing",
		name: "Inspect representative sessions to explain product usage patterns",
		query:
			"Dig into specific sessions that seem interesting, then explain how people use the product. Separate demo/tour browsing from authenticated product usage if the data supports it, and call out instrumentation issues instead of guessing.",
		websiteId: WS,
		expect: {
			maxSteps: 20,
			maxLatencyMs: 300_000,
			toolsCalled: ["get_data"],
			toolInputs: [
				{
					tool: "get_data",
					includes: { type: "interesting_sessions" },
				},
			],
			responseNotMatches: [
				{
					description: "must not use nonexistent pageview event name",
					pattern: "event_name\\s*=\\s*['\"]pageview['\"]",
				},
			],
		},
	},
	// Adversarial / edge probes for get_data behavior.
	{
		id: "adv-getdata-batch-three-breakdowns",
		category: "tool-routing",
		name: "Three breakdowns in one ask should be batched, not sequential",
		query:
			"Give me top pages, top countries, and top referrers for the last 7 days. One table per breakdown.",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 6,
			maxLatencyMs: 120_000,
			toolsCalled: ["get_data"],
			toolCallCounts: [{ tool: "get_data", min: 1, max: 2 }],
			batchedQueries: true,
		},
	},
	{
		id: "adv-getdata-week-over-week-comparison",
		category: "tool-routing",
		name: "Week-over-week comparison must use two date ranges, not one",
		query:
			"Compare this week's traffic to last week — sessions and bounce rate.",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 6,
			maxLatencyMs: 120_000,
			toolsCalled: ["get_data"],
			responseMatches: [
				{
					description:
						"response should mention both periods so the comparison is grounded",
					pattern:
						"\\b(this week|last week|previous week|7-?day|prior week|week over week|wow)\\b",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-getdata-nonexistent-dimension-asks-clarification",
		category: "tool-routing",
		name: "Ask for a dimension that doesn't exist ('by job title') must clarify, not fabricate",
		query: "show me bounce rate by user job title for last 30 days",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 120_000,
			responseNotMatches: [
				{
					description:
						"must not invent specific job-title bounce-rate percentages",
					pattern:
						"\\b(engineer|product manager|designer|executive|founder)\\b.*\\b\\d+(\\.\\d+)?\\s*%",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-getdata-empty-result-honest",
		category: "tool-routing",
		name: "Asking about feature_flag_evaluated when no events fire must say so, not invent counts",
		query:
			"how many feature flag evaluations happened in the last 7 days, by flag key?",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 6,
			maxLatencyMs: 90_000,
			toolsCalled: ["get_data"],
			responseNotMatches: [
				{
					description:
						"must not fabricate specific flag-key counts when the underlying event isn't tracked",
					pattern:
						"\\b(flag[_-]?key|feature[_-]?flag)\\s*[:=]?\\s*['\"]?[a-z0-9_-]+['\"]?\\s*[:=-]?\\s*\\d+",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-getdata-unknown-query-type-recovery",
		category: "tool-routing",
		name: "Invalid query type must not produce fabricated 'popularity score' data",
		query:
			"what's my most popular page yesterday? Use the page_popularity_score query.",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 120_000,
			toolsCalled: ["get_data"],
			responseNotMatches: [
				{
					description:
						"must not invent a popularity score number out of thin air",
					pattern: "\\bpopularity[ _-]?score\\b[\\s\\S]*?\\b\\d+(\\.\\d+)?\\b",
					flags: "i",
				},
			],
			responseMatches: [
				{
					description:
						"agent must either pivot to a valid type (top_pages, pageviews) or surface that the requested type isn't valid",
					pattern:
						"\\b(top[_ -]?pages|pageviews|invalid|not (a |)valid|isn'?t (a |)valid|unknown query|doesn'?t exist|no such (query|type))\\b",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-getdata-relative-time-resolution",
		category: "tool-routing",
		name: "'Two Tuesdays ago' should resolve to a concrete date range or be asked about",
		query: "what were our top pages two Tuesdays ago?",
		websiteId: WS,
		tags: ["adversarial", "get_data"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 120_000,
			responseMatches: [
				{
					description:
						"agent should restate the concrete date it picked or ask the user to confirm",
					pattern:
						"\\b(202[4-9]-\\d{2}-\\d{2}|tuesday|may|jun|just to confirm|do you mean)\\b",
					flags: "i",
				},
			],
		},
	},
	// Adversarial / edge probes for execute_sql_query behavior.
	{
		id: "adv-sql-pageview-event-name",
		category: "tool-routing",
		name: "Path-overlap query must use event_name='screen_view', not 'pageview'",
		query:
			"For the last 7 days, how many sessions visited BOTH /pricing and /docs at any point in the session? Use SQL — get_data can't express the set intersection.",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 180_000,
			toolsCalled: ["execute_sql_query"],
			toolInputs: [
				{
					tool: "execute_sql_query",
					excludes: ["event_name = 'pageview'"],
				},
			],
			responseNotMatches: [
				{
					description:
						"agent must not surface 'event_name = pageview' anywhere in the response",
					pattern: "event_name\\s*=\\s*['\"]pageview['\"]",
				},
			],
		},
	},
	{
		id: "adv-sql-events-timestamp-column",
		category: "tool-routing",
		name: "Queries on analytics.events must filter on 'time', not 'timestamp'",
		query:
			"Run SQL to find the 5 longest individual page views from the last 30 days — show path, time_on_page, browser, country. Just the analytics.events table.",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 180_000,
			toolsCalled: ["execute_sql_query"],
			toolInputs: [
				{
					tool: "execute_sql_query",
					excludes: ["events.timestamp", "e.timestamp"],
				},
			],
		},
	},
	{
		id: "adv-sql-revenue-uses-owner-id",
		category: "tool-routing",
		name: "Revenue table must end up filtered with owner_id (validator now rejects client_id)",
		query:
			"Pull total revenue in the last 30 days grouped by provider, using SQL on the revenue table.",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 10,
			maxLatencyMs: 240_000,
			toolsCalled: ["execute_sql_query"],
			responseNotMatches: [
				{
					description:
						"agent must not claim no revenue data without resolving the tenant filter — the SQL succeeds when owner_id is used; an honest 'no data found via owner_id' is fine, but 'no data because tool errored' isn't",
					pattern:
						"\\b(tool errored|validation failed|couldn'?t (run|query|execute) (the |that |any )?sql|sql (failed|rejected|blocked))\\b",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-sql-uniq-not-count-distinct",
		category: "tool-routing",
		name: "Counting unique visitors must use uniq(), not COUNT(DISTINCT ...)",
		query:
			"Use SQL to count unique sessions per country for the last 7 days, ordered by sessions desc, limit 10.",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 8,
			maxLatencyMs: 180_000,
			toolsCalled: ["execute_sql_query"],
			toolInputs: [
				{
					tool: "execute_sql_query",
					excludes: ["COUNT(DISTINCT", "count(distinct"],
				},
			],
		},
	},
	{
		id: "adv-sql-decimal-needs-tofloat64",
		category: "tool-routing",
		name: "quantile over revenue.amount must not crash on the Decimal type",
		query:
			"Show me the median and p90 revenue transaction amount in the last 30 days, by provider. Use SQL.",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 12,
			maxLatencyMs: 300_000,
			toolsCalled: ["execute_sql_query"],
			responseNotMatches: [
				{
					description:
						"agent must not propagate ClickHouse Decimal-type errors back to the user uninterpreted",
					pattern:
						"\\b(ILLEGAL_TYPE_OF_ARGUMENT|Argument for function .*must be Float|cannot be used with arguments of type Decimal)\\b",
					flags: "i",
				},
			],
		},
	},
	{
		id: "adv-sql-escalation-guard",
		category: "tool-routing",
		name: "Simple 'top pages' ask should go via get_data, not SQL",
		query: "show me top pages last 7 days",
		websiteId: WS,
		tags: ["adversarial", "execute_sql"],
		expect: {
			maxSteps: 4,
			maxLatencyMs: 60_000,
			toolsCalled: ["get_data"],
			toolsNotCalled: ["execute_sql_query"],
		},
	},
];
