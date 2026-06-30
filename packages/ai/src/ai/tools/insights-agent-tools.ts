import { tool } from "ai";
import { z } from "zod";
import {
	BUSINESS_INSIGHT_QUERY_TYPES,
	fetchBusinessMetrics,
} from "../insights/business-context";
import {
	fetchOpsMetrics,
	OPS_INSIGHT_QUERY_TYPES,
} from "../insights/ops-context";
import {
	fetchProductMetrics,
	PRODUCT_INSIGHT_QUERY_TYPES,
} from "../insights/product-context";
import { getAppContext } from "./utils";
import { executeAgentSqlForWebsite } from "./execute-sql-query";
import { executeQuery } from "../../query";
import { QueryBuilders } from "../../query/builders";
import type { QueryRequest } from "../../query/types";
import type { WeekOverWeekPeriod } from "../insights/types";

const MAX_RESPONSE_CHARS = 48_000;
const MAX_QUERIES = 8;

const ALL_QUERY_TYPES = Object.keys(QueryBuilders);

function isValidQueryType(type: string): boolean {
	return type in QueryBuilders;
}

function truncate(obj: unknown): string {
	const s = JSON.stringify(obj, null, 0);
	return s.length > MAX_RESPONSE_CHARS
		? `${s.slice(0, MAX_RESPONSE_CHARS)}\n…[truncated]`
		: s;
}

export interface CreateInsightsAgentToolsParams {
	domain: string;
	periodBounds: WeekOverWeekPeriod;
	timezone: string;
	websiteId: string;
}

export function createInsightsAgentTools(
	params: CreateInsightsAgentToolsParams
) {
	function resolveRanges(period: "current" | "previous" | "both") {
		if (period === "both") {
			return [
				{ label: "current" as const, range: params.periodBounds.current },
				{ label: "previous" as const, range: params.periodBounds.previous },
			];
		}
		return [
			{
				label: period,
				range:
					period === "current"
						? params.periodBounds.current
						: params.periodBounds.previous,
			},
		];
	}

	const querySchema = z.object({
		type: z.string().refine(isValidQueryType, "Unknown query type"),
		limit: z.number().min(1).max(50).optional(),
		filters: z
			.array(
				z.object({
					field: z.string(),
					value: z.string(),
				})
			)
			.optional(),
	});

	const periodSchema = z.enum(["current", "previous", "both"]);

	const webMetricsTool = tool({
		description: `Query analytics data. ${ALL_QUERY_TYPES.length} query types. Use period="both" to compare. Key types: summary_metrics, top_pages, entry_pages, exit_pages, recent_errors, errors_by_page, error_types, session_flow, session_pages, interesting_sessions, session_list, sessions_by_device, sessions_by_browser, web_vitals_by_page, web_vitals_by_browser, revenue_overview, revenue_by_referrer, custom_events_discovery, custom_events_trends, country, region, city, utm_campaigns, device_types. Filter by: path, country, device_type, browser_name, os_name, referrer, utm_source, utm_medium, utm_campaign.`,
		inputSchema: z.object({
			period: periodSchema,
			queries: z.array(querySchema).min(1).max(MAX_QUERIES),
		}),
		execute: async ({ period, queries }) => {
			const ranges = resolveRanges(period);

			const tasks = ranges.flatMap((p) =>
				queries.map(async (q) => {
					if (!isValidQueryType(q.type)) {
						return { period: p.label, type: q.type, rowCount: 0, data: [] };
					}

					const req: QueryRequest = {
						projectId: params.websiteId,
						type: q.type,
						from: p.range.from,
						to: p.range.to,
						timezone: params.timezone,
						limit: q.limit ?? 10,
						filters: q.filters?.map((f) => ({
							field: f.field,
							op: "eq" as const,
							value: f.value,
						})),
					};

					try {
						const data = (await executeQuery(
							req,
							params.domain,
							params.timezone
						)) as Record<string, unknown>[];
						return {
							period: p.label,
							type: q.type,
							rowCount: Array.isArray(data) ? data.length : 0,
							data: Array.isArray(data) ? data : [],
						};
					} catch {
						return { period: p.label, type: q.type, rowCount: 0, data: [] };
					}
				})
			);

			const results = await Promise.all(tasks);
			return truncate({ period, results });
		},
	});

	const productMetricsTool = tool({
		description:
			"Goals, funnels, retention, and custom event behavior. Use for conversion context.",
		inputSchema: z.object({
			period: periodSchema,
			queries: z
				.array(
					z.object({
						type: z.enum(PRODUCT_INSIGHT_QUERY_TYPES),
						limit: z.number().min(1).max(10).optional(),
					})
				)
				.min(1)
				.max(MAX_QUERIES),
		}),
		execute: async ({ period, queries }, options) => {
			const appContext = getAppContext(options);
			const ranges = resolveRanges(period);
			const results = await Promise.all(
				ranges.map((p) =>
					fetchProductMetrics(
						appContext,
						params.periodBounds,
						p.label,
						queries
					).then((data) => ({ period: p.label, data }))
				)
			);
			return truncate(results.length === 1 ? results[0] : results);
		},
	});

	const opsContextTool = tool({
		description:
			"Errors, uptime, anomalies, flag changes. Use for reliability context.",
		inputSchema: z.object({
			period: periodSchema,
			queries: z
				.array(
					z.object({
						type: z.enum(OPS_INSIGHT_QUERY_TYPES),
						limit: z.number().min(1).max(10).optional(),
					})
				)
				.min(1)
				.max(MAX_QUERIES),
		}),
		execute: async ({ period, queries }, options) => {
			const appContext = getAppContext(options);
			const ranges = resolveRanges(period);
			const results = await Promise.all(
				ranges.map((p) =>
					fetchOpsMetrics(
						appContext,
						params.periodBounds,
						p.label,
						queries
					).then((data) => ({ period: p.label, data }))
				)
			);
			return truncate(results.length === 1 ? results[0] : results);
		},
	});

	const businessContextTool = tool({
		description:
			"Revenue totals, attribution, top products. Use for commercial context.",
		inputSchema: z.object({
			period: periodSchema,
			queries: z
				.array(
					z.object({
						type: z.enum(BUSINESS_INSIGHT_QUERY_TYPES),
						limit: z.number().min(1).max(10).optional(),
					})
				)
				.min(1)
				.max(MAX_QUERIES),
		}),
		execute: async ({ period, queries }, options) => {
			const appContext = getAppContext(options);
			const ranges = resolveRanges(period);
			const results = await Promise.all(
				ranges.map((p) =>
					fetchBusinessMetrics(
						appContext,
						params.periodBounds,
						p.label,
						queries
					).then((data) => ({ period: p.label, data }))
				)
			);
			return truncate(results.length === 1 ? results[0] : results);
		},
	});

	const sqlTool = tool({
		description: `Raw ClickHouse SQL for cross-table joins and complex analysis. Use web_metrics first.

Tables (all filtered by website automatically):
- analytics.events: session_id, time, path, referrer, browser_name, device_type, country, region, event_name, time_on_page, scroll_depth, utm_source, utm_medium, utm_campaign
- analytics.error_spans: session_id, timestamp, path, message, stack, error_type
- analytics.web_vitals_spans: timestamp, path, metric_name, metric_value
- analytics.custom_events: event_name, timestamp, properties (JSON), session_id
- analytics.revenue: transaction_id, amount Decimal(18,4), currency, provider, type, customer_id, created
- analytics.blocked_traffic: timestamp, block_reason, bot_name, path

Every WHERE clause needs a tenant filter: use client_id = {websiteId:String} for events/error_spans/vitals/blocked_traffic, or owner_id = {websiteId:String} for custom_events/revenue. Use uniq() not COUNT(DISTINCT). quantileTDigest on Decimal needs toFloat64() cast. Pageviews = event_name = 'screen_view'. Timestamp column is "time" in events, "timestamp" in other tables. No aggregates in WHERE. No correlated subqueries — use CTEs. {paramName:Type} placeholders only.`,
		inputSchema: z.object({
			queries: z
				.array(
					z.object({
						label: z.string(),
						sql: z.string(),
						params: z.record(z.string(), z.unknown()).optional(),
					})
				)
				.min(1)
				.max(5),
		}),
		execute: async ({ queries }) => {
			const results = await Promise.all(
				queries.map(async (q) => {
					try {
						const result = await executeAgentSqlForWebsite({
							websiteId: params.websiteId,
							websiteDomain: params.domain,
							sql: q.sql,
							params: q.params,
						});
						return { label: q.label, ...result };
					} catch (err: unknown) {
						return {
							label: q.label,
							error:
								err instanceof Error
									? err.message.slice(0, 200)
									: "Query failed",
							data: [],
						};
					}
				})
			);
			return truncate(results);
		},
	});

	return {
		tools: {
			business_context: businessContextTool,
			execute_sql: sqlTool,
			ops_context: opsContextTool,
			product_metrics: productMetricsTool,
			web_metrics: webMetricsTool,
		},
	};
}
