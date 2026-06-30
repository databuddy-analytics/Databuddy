import { z } from "zod";

const insightSourceSchema = z.enum(["web", "product", "ops", "business"]);

const insightMetricSchema = z.object({
	label: z
		.string()
		.describe("Short user-facing label (e.g. 'Visitors', 'Bounce rate')"),
	current: z.number().describe("Value for current period"),
	previous: z.number().optional().describe("Value for previous period"),
	format: z
		.enum(["number", "percent", "duration_ms", "duration_s"])
		.default("number"),
});

export const insightSchema = z.object({
	title: z
		.string()
		.describe(
			"Brief plain-English headline under 80 chars for a founder/operator. Avoid raw metric jargon like INP, LCP, FCP, TTFB, CLS, p75 in titles; translate to outcomes such as 'Interactions got slower' or 'Pages feel slower'. Never paste opaque IDs or URL slugs. Use calm recurrence wording; avoid 'again'/'still' unless recurrence is the main finding."
		),
	description: z
		.string()
		.describe(
			"1-2 sentences: evidence for what changed. Do NOT restate numbers from the title or metrics array unless they are essential. Add NEW context only. Under 300 characters. Use object names, not raw IDs."
		),
	suggestion: z
		.string()
		.describe(
			"One specific action in plain English. Name the exact page, button, query, or tool to use. Under 300 characters. Do not expose raw internal IDs; put IDs only in action params."
		),
	metrics: z
		.array(insightMetricSchema)
		.min(1)
		.max(5)
		.describe(
			"1-5 key data points backing this insight. Always include the primary metric the insight is about, then supporting metrics that add context. These are shown as structured data alongside the narrative description."
		),
	severity: z.enum(["critical", "warning", "info"]),
	sentiment: z
		.enum(["positive", "neutral", "negative"])
		.describe(
			"positive = improving metric, neutral = stable, negative = declining or broken"
		),
	priority: z
		.number()
		.min(1)
		.max(10)
		.describe(
			"1-10 from actionability x business impact, NOT raw % magnitude. User-facing errors, conversion/session drops, or reliability issues outrank vanity traffic spikes. A 5% drop in a meaningful engagement metric can score higher than a 70% visitor increase with no conversion context. Reserve 8-10 for issues that hurt users or revenue signals in the data."
		),
	type: z.enum([
		"error_spike",
		"new_errors",
		"vitals_degraded",
		"custom_event_spike",
		"traffic_drop",
		"traffic_spike",
		"bounce_rate_change",
		"engagement_change",
		"referrer_change",
		"page_trend",
		"positive_trend",
		"performance",
		"uptime_issue",
		"conversion_leak",
		"funnel_regression",
		"channel_concentration",
		"reliability_improved",
		"persistent_error_hotspot",
		"quality_shift",
		"cross_property_dependency",
		"performance_improved",
		"deploy_correlation",
		"segment_regression",
		"error_impact",
		"cross_signal",
	]),
	changePercent: z
		.number()
		.optional()
		.describe(
			"Signed week-over-week % for the primary metric in this insight: (current-previous)/previous*100. Positive when that metric rose, negative when it fell."
		),
	subjectKey: z
		.string()
		.min(1)
		.describe(
			"Stable identifier for the underlying signal, such as pricing_page, organic_search, signup_goal, checkout_revenue, or signup_errors. Reuse the same subjectKey for the same narrative so downstream dedupe can detect repeats."
		),
	sources: z
		.array(insightSourceSchema)
		.min(1)
		.max(4)
		.describe(
			"Which evidence domains support this insight. Use only the domains actually used: web, product, ops, business."
		),
	confidence: z
		.number()
		.min(0)
		.max(1)
		.describe(
			"Confidence from 0 to 1 based on how directly the data supports the conclusion. Higher when multiple signals align or the cause is explicit in the data."
		),
	impactSummary: z
		.string()
		.optional()
		.describe(
			"Optional short statement of why this matters to the operator. Use when the impact is clear from the available data. Keep to a single sentence."
		),
	rootCause: z
		.string()
		.optional()
		.describe(
			"WHY it happened (the mechanism). Must add info beyond the description. Skip if unknown."
		),
	evidence: z
		.array(
			z.object({
				type: z.enum(["segment", "error", "annotation", "temporal", "metric"]),
				description: z.string(),
			})
		)
		.max(5)
		.optional()
		.describe(
			"Data points NOT already in description or rootCause. Each bullet must be a different fact."
		),
	investigationDepth: z
		.enum(["surface", "investigated", "deep"])
		.optional()
		.describe("How deeply this signal was investigated"),
	actions: z
		.array(
			z.object({
				type: z.enum([
					"fix_goal",
					"create_funnel",
					"add_custom_event",
					"create_annotation",
					"update_config",
					"add_tracking",
					"investigate_further",
					"code_fix",
				]),
				label: z.string().describe("Button label (e.g. 'Fix goal target')"),
				params: z
					.record(z.string(), z.string())
					.describe(
						"Action-specific parameters. code_fix: {prompt, file_hint, error_message} — generates a cursor/claude-code-ready prompt."
					),
			})
		)
		.max(3)
		.optional()
		.describe(
			"Machine-readable actions the user can take. fix_goal: {goalName, from, to}. create_funnel: {name, steps}. add_custom_event: {eventName, element, page}. create_annotation: {text, date}. add_tracking: {page, element, snippet}. investigate_further: {prompt}."
		),
});

export type ParsedInsight = z.infer<typeof insightSchema>;
export type InsightMetric = z.infer<typeof insightMetricSchema>;
export type InsightAction = NonNullable<ParsedInsight["actions"]>[number];
