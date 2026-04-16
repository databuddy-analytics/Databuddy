import type { EvalCase } from "../types";

const WS = "OXmNQsViBT-FOS_wZCTHc";

/**
 * Format cases — complex visualization requests that test the agent's
 * ability to produce multiple chart types, structured data tables, and
 * clearly labeled composite dashboards in a single response.
 */
export const formatCases: EvalCase[] = [
	{
		id: "executive-dashboard-multi-viz",
		category: "format",
		name: "Five-component executive dashboard with mixed chart types",
		query:
			"Build me an executive dashboard with exactly these components: (1) area chart of daily traffic for the last 30 days with visitors and pageviews, (2) donut chart of traffic sources, (3) bar chart of top 10 pages, (4) data table of Core Web Vitals scores by page with ratings (good/needs improvement/poor), (5) mini-map of geographic distribution. Label everything clearly.",
		websiteId: WS,
		expect: {
			validChartJSON: true,
			noRawJSON: true,
			maxSteps: 20,
			maxLatencyMs: 180_000,
		},
	},
	{
		id: "before-after-comparison-overlay",
		category: "format",
		name: "Week-over-week comparison with overlaid trends and delta table",
		query:
			"Create a before/after comparison visualization for this week vs last week. I want to see the traffic trend lines overlaid, plus a table showing the delta for each key metric (with direction indicators). Make it scannable for a 30-second review.",
		websiteId: WS,
		expect: {
			validChartJSON: true,
			noRawJSON: true,
			maxSteps: 20,
			maxLatencyMs: 180_000,
		},
	},
	{
		id: "error-report-full-breakdown",
		category: "format",
		name: "Full error report with trends chart, grouped table, and new error detection",
		query:
			"Show me a full error report: error trends over the last 14 days as a chart, top errors by frequency as a table with error type, message, page, and count. Group related errors. Highlight any errors that are NEW this week vs last week.",
		websiteId: WS,
		expect: {
			validChartJSON: true,
			noRawJSON: true,
			maxSteps: 20,
			maxLatencyMs: 180_000,
		},
	},
];
