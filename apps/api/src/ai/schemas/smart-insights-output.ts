import { z } from "zod";

export const insightSourceSchema = z.enum([
	"web",
	"product",
	"ops",
	"business",
]);

export const insightMetricSchema = z.object({
	label: z
		.string()
		.describe(
			"Short human-readable metric name, e.g. 'Visitors', 'Bounce Rate', 'LCP (p75)', 'Errors'"
		),
	current: z.number().describe("Value for the current period"),
	previous: z
		.number()
		.optional()
		.describe("Value for the previous period (omit if no comparison)"),
	format: z
		.enum(["number", "percent", "duration_ms", "duration_s"])
		.default("number")
		.describe(
			"How to display: number = raw count, percent = %, duration_ms = milliseconds, duration_s = seconds"
		),
});

export const insightSchema = z.object({
	title: z
		.string()
		.describe(
			"Brief headline under 60 chars with the key number. Never paste raw URL paths that contain opaque ID segments (long random slugs). Use human labels from Top Pages 'Human label' (e.g. 'Demo page', 'Pricing page', 'Home') instead of paths like /demo/xYz12…"
		),
	description: z
		.string()
		.describe(
			"2-3 concise sentences explaining WHY the change matters and what likely caused it. Do NOT restate numbers that are already in the metrics array — reference metrics by their label name instead (e.g. 'Contact Page Visitors dropped sharply while Pricing Page Visitors surged'). Focus on the narrative: causes, implications, and context that the numbers alone cannot convey. End with a full stop. Name pages using human labels when the path has opaque IDs."
		),
	suggestion: z
		.string()
		.describe(
			"One or two actionable sentences tied to THIS product's data. Reference metric labels from the metrics array rather than restating their values. Recommend a specific next step grounded in the data pattern. Do not give generic marketing platitudes or hypothetical tactics."
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
			"1-10 from actionability × business impact, NOT raw % magnitude. User-facing errors, conversion/session drops, or reliability issues outrank vanity traffic spikes. A 5% drop in a meaningful engagement metric can score higher than a 70% visitor increase with no conversion context. Reserve 8-10 for issues that hurt users or revenue signals in the data."
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
	]),
	changePercent: z
		.number()
		.optional()
		.describe(
			"Signed week-over-week % for the primary metric in this insight: (current−previous)/previous×100. Positive when that metric rose (more visitors, more errors, higher rate), negative when it fell. Must match the headline magnitude; do not flip the sign based on sentiment (e.g. channel-risk stories still use a positive % when traffic grew)."
		),
	subjectKey: z
		.string()
		.min(1)
		.max(120)
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
		.max(160)
		.optional()
		.describe(
			"Optional short statement of user or business impact. Use when the impact is clear from the available data."
		),
});

export const insightsOutputSchema = z.object({
	insights: z
		.array(insightSchema)
		.max(3)
		.describe(
			"1-3 insights ranked by actionability × business impact. When the week is mostly positive, at least one insight MUST still call out a material risk or watch (e.g. session duration down, bounce up, single-channel dependency, volatile referrer, error count up in absolute terms) if those signals appear in the data—do not only celebrate wins. Skip repeating a narrative already listed under recently reported insights unless the change is materially new."
		),
});

export type ParsedInsight = z.infer<typeof insightSchema>;
export type InsightMetric = z.infer<typeof insightMetricSchema>;
