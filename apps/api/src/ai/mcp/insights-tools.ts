import { cacheable } from "@databuddy/redis";
import dayjs from "dayjs";
import { z } from "zod";
import {
	fetchInsightsForOrgs,
	type InsightRow,
} from "../../lib/insights-query";
import { executeQuery } from "../../query";
import {
	defineMcpTool,
	McpToolError,
	type McpToolFactory,
} from "./define-tool";
import { resolveOrganizationIds } from "./tool-context";

const INSIGHT_TYPES = [
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
] as const;

const INSIGHT_SEVERITIES = ["critical", "warning", "info"] as const;
const INSIGHT_SENTIMENTS = ["positive", "neutral", "negative"] as const;

const PERIOD_PRESETS = [
	"last_24h",
	"last_7d",
	"last_14d",
	"last_30d",
	"last_90d",
	"today",
	"yesterday",
] as const;
type PeriodPreset = (typeof PERIOD_PRESETS)[number];

const SINCE_PRESETS = ["last_24h", "last_7d", "last_30d", "last_90d"] as const;

const INSIGHTS_LIST_CACHE_TTL = 60;
const INSIGHTS_LIST_FETCH_LIMIT = 200;

const PeriodSchema = z.object({
	from: z.string(),
	to: z.string(),
});

const DirectionSchema = z.enum(["up", "down", "flat"]);

type MetricFormat = "number" | "percent" | "duration_s";
type BetterWhen = "higher" | "lower";

interface MetricDefinition {
	betterWhen: BetterWhen;
	field: string;
	format: MetricFormat;
	label: string;
	queryType: string;
}

const METRIC_REGISTRY: Record<string, MetricDefinition> = {
	visitors: {
		label: "Visitors",
		queryType: "summary_metrics",
		field: "unique_visitors",
		format: "number",
		betterWhen: "higher",
	},
	sessions: {
		label: "Sessions",
		queryType: "summary_metrics",
		field: "sessions",
		format: "number",
		betterWhen: "higher",
	},
	pageviews: {
		label: "Pageviews",
		queryType: "summary_metrics",
		field: "pageviews",
		format: "number",
		betterWhen: "higher",
	},
	bounce_rate: {
		label: "Bounce Rate",
		queryType: "summary_metrics",
		field: "bounce_rate",
		format: "percent",
		betterWhen: "lower",
	},
	session_duration: {
		label: "Median Session Duration",
		queryType: "summary_metrics",
		field: "median_session_duration",
		format: "duration_s",
		betterWhen: "higher",
	},
	events: {
		label: "Total Events",
		queryType: "summary_metrics",
		field: "total_events",
		format: "number",
		betterWhen: "higher",
	},
};

const METRIC_KEYS = Object.keys(METRIC_REGISTRY) as [string, ...string[]];

interface DimensionDefinition {
	keyField: string;
	label: string;
	queryType: string;
}

const DIMENSION_REGISTRY: Record<string, DimensionDefinition> = {
	pages: { label: "Page", queryType: "top_pages", keyField: "name" },
	referrers: {
		label: "Referrer",
		queryType: "top_referrers",
		keyField: "name",
	},
	countries: { label: "Country", queryType: "country", keyField: "name" },
	browsers: { label: "Browser", queryType: "browser_name", keyField: "name" },
	os: { label: "Operating System", queryType: "os_name", keyField: "name" },
};

const DIMENSION_KEYS = Object.keys(DIMENSION_REGISTRY) as [string, ...string[]];

const ANOMALY_METRICS: { key: string; label: string; field: string }[] = [
	{ key: "visitors", label: "Visitors", field: "visitors" },
	{ key: "sessions", label: "Sessions", field: "sessions" },
	{ key: "pageviews", label: "Pageviews", field: "pageviews" },
	{ key: "bounce_rate", label: "Bounce Rate", field: "bounce_rate" },
	{
		key: "session_duration",
		label: "Median Session Duration",
		field: "median_session_duration",
	},
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value: string): boolean {
	return ISO_DATE_RE.test(value) && dayjs(value).isValid();
}

function resolvePeriodRange(input: {
	period?: PeriodPreset;
	from?: string;
	to?: string;
}): { from: string; to: string } | Error {
	if (input.from || input.to) {
		if (!(input.from && input.to)) {
			return new Error("Both 'from' and 'to' are required for custom periods");
		}
		if (!isValidDate(input.from)) {
			return new Error("'from' must be YYYY-MM-DD");
		}
		if (!isValidDate(input.to)) {
			return new Error("'to' must be YYYY-MM-DD");
		}
		if (dayjs(input.from).isAfter(dayjs(input.to))) {
			return new Error("'from' must be on or before 'to'");
		}
		return { from: input.from, to: input.to };
	}
	const today = dayjs();
	const preset: PeriodPreset = input.period ?? "last_7d";
	switch (preset) {
		case "last_24h":
			return {
				from: today.subtract(1, "day").format("YYYY-MM-DD"),
				to: today.format("YYYY-MM-DD"),
			};
		case "last_7d":
			return {
				from: today.subtract(6, "day").format("YYYY-MM-DD"),
				to: today.format("YYYY-MM-DD"),
			};
		case "last_14d":
			return {
				from: today.subtract(13, "day").format("YYYY-MM-DD"),
				to: today.format("YYYY-MM-DD"),
			};
		case "last_30d":
			return {
				from: today.subtract(29, "day").format("YYYY-MM-DD"),
				to: today.format("YYYY-MM-DD"),
			};
		case "last_90d":
			return {
				from: today.subtract(89, "day").format("YYYY-MM-DD"),
				to: today.format("YYYY-MM-DD"),
			};
		case "today": {
			const t = today.format("YYYY-MM-DD");
			return { from: t, to: t };
		}
		case "yesterday": {
			const y = today.subtract(1, "day").format("YYYY-MM-DD");
			return { from: y, to: y };
		}
		default:
			return new Error(`Unknown period preset: ${preset}`);
	}
}

function computePreviousPeriod(current: { from: string; to: string }): {
	from: string;
	to: string;
} {
	const start = dayjs(current.from);
	const end = dayjs(current.to);
	const days = end.diff(start, "day") + 1;
	return {
		from: start.subtract(days, "day").format("YYYY-MM-DD"),
		to: start.subtract(1, "day").format("YYYY-MM-DD"),
	};
}

function parseSinceShorthand(since: string): Date | undefined {
	const now = dayjs();
	switch (since) {
		case "last_24h":
			return now.subtract(24, "hour").toDate();
		case "last_7d":
			return now.subtract(7, "day").toDate();
		case "last_30d":
			return now.subtract(30, "day").toDate();
		case "last_90d":
			return now.subtract(90, "day").toDate();
		default:
			return;
	}
}

function formatMetricValue(value: number, format: MetricFormat): string {
	if (format === "percent") {
		return `${value.toFixed(1)}%`;
	}
	if (format === "duration_s") {
		if (value < 60) {
			return `${Math.round(value)}s`;
		}
		const minutes = Math.floor(value / 60);
		const seconds = Math.round(value % 60);
		return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
	}
	if (Math.abs(value) >= 1000) {
		return Math.round(value).toLocaleString("en-US");
	}
	if (Number.isInteger(value)) {
		return value.toString();
	}
	return value.toFixed(1);
}

function roundForFormat(value: number, format: MetricFormat): number {
	if (!Number.isFinite(value)) {
		return 0;
	}
	const decimals = format === "percent" ? 2 : format === "duration_s" ? 1 : 0;
	return Number(value.toFixed(decimals));
}

function safeDeltaPercent(current: number, previous: number): number {
	if (previous === 0) {
		return current === 0 ? 0 : 100;
	}
	return ((current - previous) / previous) * 100;
}

function deltaDirection(
	current: number,
	previous: number
): "up" | "down" | "flat" {
	if (current > previous) {
		return "up";
	}
	if (current < previous) {
		return "down";
	}
	return "flat";
}

function buildMetricHeadline(
	label: string,
	current: number,
	previous: number,
	format: MetricFormat
): string {
	const direction = deltaDirection(current, previous);
	const currentStr = formatMetricValue(current, format);
	if (direction === "flat") {
		return `${label} unchanged at ${currentStr}`;
	}
	const previousStr = formatMetricValue(previous, format);
	const pctStr = Math.abs(safeDeltaPercent(current, previous)).toFixed(1);
	const word = direction === "up" ? "up" : "down";
	return `${label} ${word} ${pctStr}% (${currentStr} vs ${previousStr})`;
}

function buildDimensionHeadline(
	dimensionLabel: string,
	keyName: string,
	metricLabel: string,
	current: number,
	previous: number
): string {
	const direction = deltaDirection(current, previous);
	if (direction === "flat") {
		return `${dimensionLabel} "${keyName}" ${metricLabel.toLowerCase()} unchanged at ${current}`;
	}
	if (previous === 0) {
		return `${dimensionLabel} "${keyName}" is new — ${current} ${metricLabel.toLowerCase()}`;
	}
	if (current === 0) {
		return `${dimensionLabel} "${keyName}" dropped to 0 (was ${previous} ${metricLabel.toLowerCase()})`;
	}
	const pctStr = Math.abs(safeDeltaPercent(current, previous)).toFixed(1);
	const word = direction === "up" ? "up" : "down";
	return `${dimensionLabel} "${keyName}" ${metricLabel.toLowerCase()} ${word} ${pctStr}% (${current} vs ${previous})`;
}

function buildAnomalyHeadline(
	label: string,
	current: number,
	baseline: number,
	zScore: number,
	format: MetricFormat
): string {
	const direction = current > baseline ? "up" : "down";
	const pctStr = Math.abs(safeDeltaPercent(current, baseline)).toFixed(1);
	const currentStr = formatMetricValue(current, format);
	const baselineStr = formatMetricValue(baseline, format);
	return `${label} ${direction} ${pctStr}% vs baseline ${baselineStr} (now ${currentStr}, z=${zScore.toFixed(1)})`;
}

function mean(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	let sum = 0;
	for (const v of values) {
		sum += v;
	}
	return sum / values.length;
}

function stddev(values: number[]): number {
	if (values.length < 2) {
		return 0;
	}
	const m = mean(values);
	let variance = 0;
	for (const v of values) {
		variance += (v - m) ** 2;
	}
	variance /= values.length - 1;
	return Math.sqrt(variance);
}

function mapInsightRow(row: InsightRow) {
	return {
		id: row.id,
		type: row.type,
		severity: row.severity,
		sentiment: row.sentiment,
		priority: row.priority,
		title: row.title,
		description: row.description,
		suggestion: row.suggestion,
		changePercent: row.changePercent ?? undefined,
		metrics: row.metrics ?? [],
		currentPeriod: {
			from: row.currentPeriodFrom,
			to: row.currentPeriodTo,
		},
		previousPeriod: {
			from: row.previousPeriodFrom,
			to: row.previousPeriodTo,
		},
		websiteId: row.websiteId,
		websiteName: row.websiteName,
		websiteDomain: row.websiteDomain,
		link: `/websites/${row.websiteId}`,
		createdAt: row.createdAt.toISOString(),
		timezone: row.timezone,
	};
}

const cachedFetchInsightsForOrgs = cacheable(fetchInsightsForOrgs, {
	expireInSec: INSIGHTS_LIST_CACHE_TTL,
	prefix: "mcp:insights",
});

const INSIGHT_FIELDS = [
	"id",
	"type",
	"severity",
	"sentiment",
	"priority",
	"title",
	"description",
	"suggestion",
	"changePercent",
	"metrics",
	"currentPeriod",
	"previousPeriod",
	"websiteId",
	"websiteName",
	"websiteDomain",
	"link",
	"createdAt",
	"timezone",
] as const;
type InsightField = (typeof INSIGHT_FIELDS)[number];

function pickInsightFields<T extends Record<string, unknown>>(
	row: T,
	fields: readonly InsightField[] | undefined
): Record<string, unknown> {
	if (!fields || fields.length === 0) {
		return row;
	}
	const out: Record<string, unknown> = {};
	for (const f of fields) {
		if (f in row) {
			out[f] = row[f];
		}
	}
	return out;
}

const listInsightsTool = defineMcpTool(
	{
		name: "list_insights",
		description:
			"List recent AI-generated insights (anomalies, trends, top movers). Defaults to org-wide. Pass websiteId to scope, ids to fetch specific insights, or fields to slim the response.",
		inputSchema: z.object({
			websiteId: z.string().optional().describe("Optional. Scope to one site."),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			ids: z
				.array(z.string())
				.min(1)
				.max(100)
				.optional()
				.describe("Fetch specific insights by id (bypasses other filters)."),
			type: z
				.array(z.enum(INSIGHT_TYPES))
				.optional()
				.describe(
					"Filter by insight type(s) (e.g. ['traffic_drop','error_spike'])"
				),
			severity: z
				.array(z.enum(INSIGHT_SEVERITIES))
				.optional()
				.describe("Filter by severity (e.g. ['critical','warning'])"),
			sentiment: z
				.array(z.enum(INSIGHT_SENTIMENTS))
				.optional()
				.describe("Filter by sentiment (e.g. ['negative'])"),
			since: z
				.enum(SINCE_PRESETS)
				.optional()
				.describe("Shorthand for createdAfter (overrides 'from' if provided)"),
			from: z.string().optional().describe("YYYY-MM-DD"),
			to: z.string().optional().describe("YYYY-MM-DD"),
			fields: z
				.array(z.enum(INSIGHT_FIELDS))
				.optional()
				.describe(
					"Subset of insight fields to return. Default returns all. Use ['id','title','severity','priority'] for slim output."
				),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.optional()
				.default(20)
				.describe("Max insights (1-100, default 20)"),
		}),
		outputSchema: z.object({
			insights: z.array(z.record(z.string(), z.unknown())),
			count: z.number(),
			scope: z.enum(["website", "organization"]),
			hint: z.string().optional(),
		}),
		resolveWebsite: "optional",
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgIds = await resolveOrganizationIds(ctx.websiteId, ctx);
		if (orgIds instanceof Error) {
			throw new McpToolError("not_found", orgIds.message);
		}

		const sinceDate = input.since
			? parseSinceShorthand(input.since)
			: undefined;
		let createdAfter: Date | undefined = sinceDate;
		let createdBefore: Date | undefined;
		if (input.from) {
			if (!isValidDate(input.from)) {
				throw new McpToolError("invalid_input", "from must be YYYY-MM-DD");
			}
			if (!createdAfter) {
				createdAfter = dayjs(input.from).startOf("day").toDate();
			}
		}
		if (input.to) {
			if (!isValidDate(input.to)) {
				throw new McpToolError("invalid_input", "to must be YYYY-MM-DD");
			}
			createdBefore = dayjs(input.to).endOf("day").toDate();
		}

		const rows = await cachedFetchInsightsForOrgs({
			organizationIds: [...orgIds].sort(),
			websiteId: ctx.websiteId,
			ids: input.ids,
			types: input.type,
			severities: input.severity,
			sentiments: input.sentiment,
			createdAfter,
			createdBefore,
			limit: input.limit,
		});

		if (rows.length === 0) {
			return {
				insights: [],
				count: 0,
				scope: ctx.websiteId ? "website" : "organization",
				hint: "No insights found for these filters. Try widening 'since' or removing type/severity filters.",
			};
		}

		return {
			insights: rows.map((r) =>
				pickInsightFields(mapInsightRow(r), input.fields)
			),
			count: rows.length,
			scope: ctx.websiteId ? "website" : "organization",
		};
	}
);

const summarizeInsightsTool = defineMcpTool(
	{
		name: "summarize_insights",
		description:
			"Compact triage view: counts by severity/type/sentiment plus top priorities. Defaults to org-wide. Set includeDetail=true to get description/suggestion on top priorities, or topN to tune how many.",
		inputSchema: z.object({
			websiteId: z.string().optional(),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			since: z
				.enum(SINCE_PRESETS)
				.optional()
				.default("last_7d")
				.describe("How far back to look (default last_7d)"),
			topN: z.coerce
				.number()
				.int()
				.min(0)
				.max(20)
				.optional()
				.default(3)
				.describe("How many top priorities to include (0-20, default 3)"),
			includeDetail: z
				.boolean()
				.optional()
				.default(false)
				.describe(
					"Include description + suggestion on topPriorities (larger payload)"
				),
			includeBreakdowns: z
				.array(z.enum(["bySeverity", "bySentiment", "byType", "byWebsite"]))
				.optional()
				.describe(
					"Which breakdowns to include. Omit to include all. Pass [] to skip all."
				),
		}),
		outputSchema: z.object({
			scope: z.enum(["website", "organization"]),
			since: z.string(),
			total: z.number(),
			bySeverity: z.record(z.string(), z.number()).optional(),
			bySentiment: z.record(z.string(), z.number()).optional(),
			byType: z.record(z.string(), z.number()).optional(),
			byWebsite: z
				.record(
					z.string(),
					z.object({
						websiteName: z.string().nullable(),
						websiteDomain: z.string(),
						count: z.number(),
					})
				)
				.optional(),
			topPriorities: z.array(z.record(z.string(), z.unknown())),
			hint: z.string().optional(),
		}),
		resolveWebsite: "optional",
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const orgIds = await resolveOrganizationIds(ctx.websiteId, ctx);
		if (orgIds instanceof Error) {
			throw new McpToolError("not_found", orgIds.message);
		}

		const createdAfter = parseSinceShorthand(input.since);

		const rows = await cachedFetchInsightsForOrgs({
			organizationIds: [...orgIds].sort(),
			websiteId: ctx.websiteId,
			createdAfter,
			limit: INSIGHTS_LIST_FETCH_LIMIT,
		});

		const want = (key: "bySeverity" | "bySentiment" | "byType" | "byWebsite") =>
			!input.includeBreakdowns || input.includeBreakdowns.includes(key);

		const bySeverity: Record<string, number> = {
			critical: 0,
			warning: 0,
			info: 0,
		};
		const bySentiment: Record<string, number> = {
			positive: 0,
			neutral: 0,
			negative: 0,
		};
		const byType: Record<string, number> = {};
		const byWebsite: Record<
			string,
			{ websiteName: string | null; websiteDomain: string; count: number }
		> = {};

		for (const r of rows) {
			bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
			bySentiment[r.sentiment] = (bySentiment[r.sentiment] ?? 0) + 1;
			byType[r.type] = (byType[r.type] ?? 0) + 1;
			const w = byWebsite[r.websiteId];
			if (w) {
				w.count += 1;
			} else {
				byWebsite[r.websiteId] = {
					websiteName: r.websiteName,
					websiteDomain: r.websiteDomain,
					count: 1,
				};
			}
		}

		const topPriorities = rows
			.slice()
			.sort((a, b) => b.priority - a.priority)
			.slice(0, input.topN)
			.map((r) => {
				const base: Record<string, unknown> = {
					id: r.id,
					priority: r.priority,
					severity: r.severity,
					type: r.type,
					title: r.title,
					websiteId: r.websiteId,
					websiteDomain: r.websiteDomain,
				};
				if (input.includeDetail) {
					base.description = r.description;
					base.suggestion = r.suggestion;
					base.changePercent = r.changePercent ?? undefined;
				}
				return base;
			});

		return {
			scope: ctx.websiteId ? "website" : "organization",
			since: input.since,
			total: rows.length,
			...(want("bySeverity") && { bySeverity }),
			...(want("bySentiment") && { bySentiment }),
			...(want("byType") && { byType }),
			...(want("byWebsite") && { byWebsite }),
			topPriorities,
			hint:
				rows.length === 0
					? "No insights in this window. Try a wider 'since' or call list_insights with no filters."
					: undefined,
		};
	}
);

const MetricEnum = z.enum(METRIC_KEYS);
const MetricComparisonSchema = z.object({
	metric: z.string(),
	label: z.string(),
	format: z.enum(["number", "percent", "duration_s"]),
	betterWhen: z.enum(["higher", "lower"]),
	current: z.number(),
	previous: z.number(),
	delta: z.number(),
	deltaPercent: z.number(),
	direction: DirectionSchema,
	isImprovement: z.boolean().nullable(),
	headline: z.string(),
});

const compareMetricTool = defineMcpTool(
	{
		name: "compare_metric",
		description:
			"Compare metric(s) across two periods. Pass a single metric (legacy shape) or an array of metrics (batched into one query per period). Auto-computes delta and previous period. Replaces 2 get_data calls.",
		inputSchema: z.object({
			websiteId: z.string().optional(),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			metric: MetricEnum.optional().describe(
				"Single metric to compare (legacy). Prefer 'metrics' for multi."
			),
			metrics: z
				.array(MetricEnum)
				.min(1)
				.max(METRIC_KEYS.length)
				.optional()
				.describe(
					`Metrics to compare in one call. Any subset of: ${METRIC_KEYS.join(", ")}`
				),
			period: z
				.enum(PERIOD_PRESETS)
				.optional()
				.describe("Date preset for the current window (default last_7d)"),
			from: z.string().optional().describe("Custom current start YYYY-MM-DD"),
			to: z.string().optional().describe("Custom current end YYYY-MM-DD"),
			compareTo: z
				.object({
					from: z.string(),
					to: z.string(),
				})
				.optional()
				.describe(
					"Custom comparison window. Defaults to the period immediately preceding 'current'."
				),
			timezone: z.string().optional().describe("IANA timezone (default UTC)"),
		}),
		outputSchema: z.object({
			currentPeriod: PeriodSchema,
			comparePeriod: PeriodSchema,
			comparisons: z.array(MetricComparisonSchema),
			websiteId: z.string(),
			websiteDomain: z.string(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = ctx.websiteId as string;
		const websiteDomain = ctx.websiteDomain ?? "unknown";
		const timezone = input.timezone ?? "UTC";

		const selectedMetrics =
			input.metrics && input.metrics.length > 0
				? [...new Set(input.metrics)]
				: input.metric
					? [input.metric]
					: [];
		if (selectedMetrics.length === 0) {
			throw new McpToolError(
				"invalid_input",
				`Pass 'metric' (single) or 'metrics' (array). Valid: ${METRIC_KEYS.join(", ")}`
			);
		}

		const currentRange = resolvePeriodRange({
			period: input.period,
			from: input.from,
			to: input.to,
		});
		if (currentRange instanceof Error) {
			throw new McpToolError("invalid_input", currentRange.message);
		}

		let compareRange: { from: string; to: string };
		if (input.compareTo) {
			if (
				!(isValidDate(input.compareTo.from) && isValidDate(input.compareTo.to))
			) {
				throw new McpToolError(
					"invalid_input",
					"compareTo.from and compareTo.to must be YYYY-MM-DD"
				);
			}
			compareRange = input.compareTo;
		} else {
			compareRange = computePreviousPeriod(currentRange);
		}

		const selectedDefs = selectedMetrics.flatMap((k) => {
			const def = METRIC_REGISTRY[k];
			return def ? [[k, def] as const] : [];
		});
		const uniqueQueryTypes = [
			...new Set(selectedDefs.map(([, d]) => d.queryType)),
		];

		const runPeriod = (range: { from: string; to: string }) =>
			Promise.all(
				uniqueQueryTypes.map((queryType) =>
					executeQuery(
						{
							projectId: websiteId,
							type: queryType,
							from: range.from,
							to: range.to,
							timezone,
						},
						websiteDomain,
						timezone
					).then((rows) => [queryType, rows] as const)
				)
			).then((entries) => new Map(entries));

		const [currentByType, previousByType] = await Promise.all([
			runPeriod(currentRange),
			runPeriod(compareRange),
		]);

		const comparisons = selectedDefs.map(([metricKey, def]) => {
			const currentRows = currentByType.get(def.queryType) ?? [];
			const previousRows = previousByType.get(def.queryType) ?? [];
			const currentValue = Number(
				(currentRows[0] as Record<string, unknown> | undefined)?.[def.field] ??
					0
			);
			const previousValue = Number(
				(previousRows[0] as Record<string, unknown> | undefined)?.[def.field] ??
					0
			);
			const direction = deltaDirection(currentValue, previousValue);
			const deltaPct = safeDeltaPercent(currentValue, previousValue);
			const isImprovement =
				direction === "flat"
					? null
					: def.betterWhen === "higher"
						? direction === "up"
						: direction === "down";
			return {
				metric: metricKey,
				label: def.label,
				format: def.format,
				betterWhen: def.betterWhen,
				current: roundForFormat(currentValue, def.format),
				previous: roundForFormat(previousValue, def.format),
				delta: roundForFormat(currentValue - previousValue, def.format),
				deltaPercent: Number(deltaPct.toFixed(2)),
				direction,
				isImprovement,
				headline: buildMetricHeadline(
					def.label,
					currentValue,
					previousValue,
					def.format
				),
			};
		});

		return {
			currentPeriod: currentRange,
			comparePeriod: compareRange,
			comparisons,
			websiteId,
			websiteDomain,
		};
	}
);

interface DimensionRow {
	name?: unknown;
	pageviews?: unknown;
	visitors?: unknown;
}

const TOP_MOVERS_DEFAULT_LIMIT = 10;
const TOP_MOVERS_MAX_LIMIT = 50;
const TOP_MOVERS_FETCH_LIMIT = 100;

const topMoversTool = defineMcpTool(
	{
		name: "top_movers",
		description:
			"Top dimension rows (pages, referrers, countries, browsers, os) that changed the most between two periods. Direct answer to 'which page changed the most' / 'which referrer surged'.",
		inputSchema: z.object({
			websiteId: z.string().optional(),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			dimension: z
				.enum(DIMENSION_KEYS)
				.describe("One of: pages, referrers, countries, browsers, os"),
			metric: z
				.enum(["visitors", "pageviews"])
				.optional()
				.default("visitors")
				.describe("Which metric to rank by (default visitors)"),
			period: z
				.enum(PERIOD_PRESETS)
				.optional()
				.describe("Current window preset (default last_7d)"),
			from: z.string().optional(),
			to: z.string().optional(),
			compareTo: z
				.object({ from: z.string(), to: z.string() })
				.optional()
				.describe("Custom comparison window. Default = previous period."),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(TOP_MOVERS_MAX_LIMIT)
				.optional()
				.default(TOP_MOVERS_DEFAULT_LIMIT),
			direction: z
				.enum(["up", "down", "both"])
				.optional()
				.default("both")
				.describe("Filter to gainers / losers / both"),
			minDeltaPercent: z.coerce
				.number()
				.min(0)
				.optional()
				.describe(
					"Drop movers whose abs(deltaPercent) is below this threshold (e.g. 10 = only >= ±10% changes)"
				),
			timezone: z.string().optional(),
		}),
		outputSchema: z.object({
			dimension: z.string(),
			dimensionLabel: z.string(),
			metric: z.string(),
			currentPeriod: PeriodSchema,
			comparePeriod: PeriodSchema,
			count: z.number(),
			movers: z.array(
				z.object({
					name: z.string(),
					current: z.number(),
					previous: z.number(),
					delta: z.number(),
					deltaPercent: z.number(),
					direction: DirectionSchema,
					headline: z.string(),
				})
			),
			truncated: z.boolean(),
			hint: z.string().optional(),
			websiteId: z.string(),
			websiteDomain: z.string(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 60, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = ctx.websiteId as string;
		const websiteDomain = ctx.websiteDomain ?? "unknown";
		const timezone = input.timezone ?? "UTC";
		const def = DIMENSION_REGISTRY[input.dimension];
		if (!def) {
			throw new McpToolError(
				"invalid_input",
				`Unknown dimension: ${input.dimension}`
			);
		}

		const currentRange = resolvePeriodRange({
			period: input.period,
			from: input.from,
			to: input.to,
		});
		if (currentRange instanceof Error) {
			throw new McpToolError("invalid_input", currentRange.message);
		}

		let compareRange: { from: string; to: string };
		if (input.compareTo) {
			if (
				!(isValidDate(input.compareTo.from) && isValidDate(input.compareTo.to))
			) {
				throw new McpToolError(
					"invalid_input",
					"compareTo.from and compareTo.to must be YYYY-MM-DD"
				);
			}
			compareRange = input.compareTo;
		} else {
			compareRange = computePreviousPeriod(currentRange);
		}

		const [currentRows, previousRows] = await Promise.all([
			executeQuery(
				{
					projectId: websiteId,
					type: def.queryType,
					from: currentRange.from,
					to: currentRange.to,
					timezone,
					limit: TOP_MOVERS_FETCH_LIMIT,
				},
				websiteDomain,
				timezone
			),
			executeQuery(
				{
					projectId: websiteId,
					type: def.queryType,
					from: compareRange.from,
					to: compareRange.to,
					timezone,
					limit: TOP_MOVERS_FETCH_LIMIT,
				},
				websiteDomain,
				timezone
			),
		]);

		const metricField = input.metric;
		const merged = new Map<
			string,
			{ name: string; current: number; previous: number }
		>();

		for (const r of currentRows as DimensionRow[]) {
			const name = String(r.name ?? "").trim();
			if (!name) {
				continue;
			}
			const value = Number(r[metricField] ?? 0);
			merged.set(name, { name, current: value, previous: 0 });
		}
		for (const r of previousRows as DimensionRow[]) {
			const name = String(r.name ?? "").trim();
			if (!name) {
				continue;
			}
			const value = Number(r[metricField] ?? 0);
			const existing = merged.get(name);
			if (existing) {
				existing.previous = value;
			} else {
				merged.set(name, { name, current: 0, previous: value });
			}
		}

		const minDelta = input.minDeltaPercent ?? 0;
		const movers = [...merged.values()]
			.filter((m) => m.current !== 0 || m.previous !== 0)
			.map((m) => ({
				name: m.name,
				current: Number(m.current.toFixed(2)),
				previous: Number(m.previous.toFixed(2)),
				delta: Number((m.current - m.previous).toFixed(2)),
				deltaPercent: Number(
					safeDeltaPercent(m.current, m.previous).toFixed(2)
				),
				direction: deltaDirection(m.current, m.previous),
				headline: buildDimensionHeadline(
					def.label,
					m.name,
					input.metric,
					m.current,
					m.previous
				),
			}))
			.filter((m) => {
				if (input.direction === "up") {
					return m.direction === "up";
				}
				if (input.direction === "down") {
					return m.direction === "down";
				}
				return m.direction !== "flat";
			})
			.filter((m) => Math.abs(m.deltaPercent) >= minDelta)
			.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
			.slice(0, input.limit);

		const fetchLimitHit =
			currentRows.length >= TOP_MOVERS_FETCH_LIMIT ||
			previousRows.length >= TOP_MOVERS_FETCH_LIMIT;

		let hint: string | undefined;
		if (movers.length === 0) {
			hint = "No movers found. Try a longer period or a different dimension.";
		} else if (fetchLimitHit) {
			hint = `Per-period fetch capped at ${TOP_MOVERS_FETCH_LIMIT} rows; some long-tail movers may be missing.`;
		}

		return {
			dimension: input.dimension,
			dimensionLabel: def.label,
			metric: input.metric,
			currentPeriod: currentRange,
			comparePeriod: compareRange,
			count: movers.length,
			movers,
			truncated: fetchLimitHit,
			hint,
			websiteId,
			websiteDomain,
		};
	}
);

interface DailyRow {
	bounce_rate?: unknown;
	date?: unknown;
	median_session_duration?: unknown;
	pageviews?: unknown;
	sessions?: unknown;
	visitors?: unknown;
}

const ANOMALY_METRIC_KEYS = ANOMALY_METRICS.map((m) => m.key) as [
	string,
	...string[],
];

const detectAnomaliesTool = defineMcpTool(
	{
		name: "detect_anomalies",
		description:
			"Find anomalies in summary metrics. Two detection arms: 'zscore' (latest day vs rolling baseline) catches spikes; 'wow' (last N days vs prior N days) catches gradual drops. Default runs both.",
		inputSchema: z.object({
			websiteId: z.string().optional(),
			websiteName: z.string().optional(),
			websiteDomain: z.string().optional(),
			method: z
				.enum(["zscore", "wow", "both"])
				.optional()
				.default("both")
				.describe(
					"Detection method. 'zscore' = latest-day outlier. 'wow' = period-over-period change. 'both' runs both (default)."
				),
			metrics: z
				.array(z.enum(ANOMALY_METRIC_KEYS))
				.optional()
				.describe(
					`Which metrics to check. Omit for all. Subset of: ${ANOMALY_METRIC_KEYS.join(", ")}`
				),
			lookbackDays: z.coerce
				.number()
				.int()
				.min(7)
				.max(60)
				.optional()
				.default(14)
				.describe(
					"Days of history (7-60, default 14). WoW splits this in half (e.g. 14 → last 7d vs prior 7d)."
				),
			threshold: z.coerce
				.number()
				.min(1.0)
				.max(5.0)
				.optional()
				.default(2.0)
				.describe("Absolute z-score threshold for zscore arm (default 2.0)"),
			minDeltaPercent: z.coerce
				.number()
				.min(0)
				.max(1000)
				.optional()
				.default(20)
				.describe(
					"Min abs(deltaPercent) for the WoW arm to flag a change (default 20)"
				),
			timezone: z.string().optional(),
		}),
		outputSchema: z.object({
			websiteId: z.string(),
			websiteDomain: z.string().optional(),
			method: z.enum(["zscore", "wow", "both"]),
			lookbackDays: z.number(),
			threshold: z.number(),
			minDeltaPercent: z.number(),
			latestDay: z.string().optional(),
			baselineDays: z.number().optional(),
			count: z.number(),
			anomalies: z.array(
				z.object({
					method: z.enum(["zscore", "wow"]),
					metric: z.string(),
					label: z.string(),
					direction: DirectionSchema,
					current: z.number(),
					baseline: z.number(),
					stddev: z.number().optional(),
					zScore: z.number().optional(),
					deltaPercent: z.number(),
					format: z.enum(["number", "percent", "duration_s"]),
					headline: z.string(),
				})
			),
			hint: z.string().optional(),
		}),
		resolveWebsite: true,
		ratelimit: { limit: 30, windowSec: 60 },
	},
	async (input, ctx) => {
		const websiteId = ctx.websiteId as string;
		const websiteDomain = ctx.websiteDomain ?? "unknown";
		const timezone = input.timezone ?? "UTC";
		const lookbackDays = input.lookbackDays;
		const threshold = input.threshold;
		const minDeltaPercent = input.minDeltaPercent;
		const method = input.method;
		const metricFilter =
			input.metrics && input.metrics.length > 0 ? new Set(input.metrics) : null;
		const activeMetrics = metricFilter
			? ANOMALY_METRICS.filter((m) => metricFilter.has(m.key))
			: ANOMALY_METRICS;

		const today = dayjs();
		const dailyFrom = today
			.subtract(lookbackDays - 1, "day")
			.format("YYYY-MM-DD");
		const dailyTo = today.format("YYYY-MM-DD");

		const runZscore = method === "zscore" || method === "both";
		const runWow = method === "wow" || method === "both";

		interface AnomalyRow {
			baseline: number;
			current: number;
			deltaPercent: number;
			direction: "up" | "down" | "flat";
			format: MetricFormat;
			headline: string;
			label: string;
			method: "zscore" | "wow";
			metric: string;
			stddev?: number;
			zScore?: number;
		}

		const anomalies: AnomalyRow[] = [];
		let latestDay: string | undefined;
		let baselineDayCount: number | undefined;
		let insufficientDataHint: string | undefined;

		if (runZscore) {
			const rows = (await executeQuery(
				{
					projectId: websiteId,
					type: "events_by_date",
					from: dailyFrom,
					to: dailyTo,
					timezone,
					timeUnit: "day",
					limit: lookbackDays + 5,
				},
				websiteDomain,
				timezone
			)) as DailyRow[];

			if (rows.length < 7) {
				insufficientDataHint = `Insufficient data for z-score: need at least 7 days, got ${rows.length}.`;
			} else {
				const sorted = [...rows].sort((a, b) =>
					String(a.date ?? "").localeCompare(String(b.date ?? ""))
				);
				const latest = sorted.at(-1);
				const baseline = sorted.slice(0, -1);

				if (latest) {
					latestDay = String(latest.date ?? "");
					baselineDayCount = baseline.length;

					for (const metric of activeMetrics) {
						const baselineValues = baseline
							.map((r) => Number(r[metric.field as keyof DailyRow] ?? 0))
							.filter((v) => Number.isFinite(v));
						if (baselineValues.length < 6) {
							continue;
						}
						const baselineMean = mean(baselineValues);
						const baselineStddev = stddev(baselineValues);
						if (baselineStddev === 0) {
							continue;
						}
						const currentValue = Number(
							latest[metric.field as keyof DailyRow] ?? 0
						);
						const zScore = (currentValue - baselineMean) / baselineStddev;
						if (Math.abs(zScore) < threshold) {
							continue;
						}
						const def = METRIC_REGISTRY[metric.key];
						const format: MetricFormat = def?.format ?? "number";
						anomalies.push({
							method: "zscore",
							metric: metric.key,
							label: metric.label,
							direction: deltaDirection(currentValue, baselineMean),
							current: roundForFormat(currentValue, format),
							baseline: roundForFormat(baselineMean, format),
							stddev: Number(baselineStddev.toFixed(2)),
							zScore: Number(zScore.toFixed(2)),
							deltaPercent: Number(
								safeDeltaPercent(currentValue, baselineMean).toFixed(2)
							),
							format,
							headline: buildAnomalyHeadline(
								metric.label,
								currentValue,
								baselineMean,
								zScore,
								format
							),
						});
					}
				}
			}
		}

		if (runWow) {
			const windowDays = Math.max(3, Math.floor(lookbackDays / 2));
			const currentFrom = today
				.subtract(windowDays - 1, "day")
				.format("YYYY-MM-DD");
			const currentTo = today.format("YYYY-MM-DD");
			const previousFrom = today
				.subtract(windowDays * 2 - 1, "day")
				.format("YYYY-MM-DD");
			const previousTo = today.subtract(windowDays, "day").format("YYYY-MM-DD");

			const [currentRows, previousRows] = await Promise.all([
				executeQuery(
					{
						projectId: websiteId,
						type: "summary_metrics",
						from: currentFrom,
						to: currentTo,
						timezone,
					},
					websiteDomain,
					timezone
				),
				executeQuery(
					{
						projectId: websiteId,
						type: "summary_metrics",
						from: previousFrom,
						to: previousTo,
						timezone,
					},
					websiteDomain,
					timezone
				),
			]);
			const currentRow = (currentRows[0] ?? {}) as Record<string, unknown>;
			const previousRow = (previousRows[0] ?? {}) as Record<string, unknown>;

			for (const metric of activeMetrics) {
				const def = METRIC_REGISTRY[metric.key];
				if (!def) {
					continue;
				}
				const currentValue = Number(currentRow[def.field] ?? 0);
				const previousValue = Number(previousRow[def.field] ?? 0);
				if (previousValue === 0 && currentValue === 0) {
					continue;
				}
				const pct = safeDeltaPercent(currentValue, previousValue);
				if (Math.abs(pct) < minDeltaPercent) {
					continue;
				}
				const format: MetricFormat = def.format;
				anomalies.push({
					method: "wow",
					metric: metric.key,
					label: metric.label,
					direction: deltaDirection(currentValue, previousValue),
					current: roundForFormat(currentValue, format),
					baseline: roundForFormat(previousValue, format),
					deltaPercent: Number(pct.toFixed(2)),
					format,
					headline: buildMetricHeadline(
						metric.label,
						currentValue,
						previousValue,
						format
					),
				});
			}
		}

		const byMetric = new Map<string, AnomalyRow>();
		for (const a of anomalies) {
			const key = a.metric;
			const prev = byMetric.get(key);
			if (!prev || Math.abs(a.deltaPercent) > Math.abs(prev.deltaPercent)) {
				byMetric.set(key, a);
			}
		}
		const deduped = [...byMetric.values()].sort(
			(a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
		);

		return {
			websiteId,
			websiteDomain,
			method,
			lookbackDays,
			threshold,
			minDeltaPercent,
			latestDay,
			baselineDays: baselineDayCount,
			count: deduped.length,
			anomalies: deduped,
			hint:
				deduped.length === 0
					? (insufficientDataHint ??
						`No anomalies detected. Try lowering threshold (${threshold}) or minDeltaPercent (${minDeltaPercent}).`)
					: undefined,
		};
	}
);

export const INSIGHT_TOOL_FACTORIES: McpToolFactory[] = [
	listInsightsTool,
	summarizeInsightsTool,
	compareMetricTool,
	topMoversTool,
	detectAnomaliesTool,
];
