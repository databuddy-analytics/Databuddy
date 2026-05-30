import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeQuery, QueryBuilders } from "../../query";
import type { QueryRequest } from "../../query/types";
import { getAppContext, resolveToolWebsite } from "./utils";

const queryItemSchema = z.object({
	type: z.string(),
	websiteId: z
		.string()
		.optional()
		.describe(
			"Target website id. Omit to use the workspace default. Required when comparing or querying a specific site in a multi-website workspace; get ids from list_websites."
		),
	from: z.string().optional(),
	to: z.string().optional(),
	preset: z
		.enum(["today", "yesterday", "last_7d", "last_14d", "last_30d", "last_90d"])
		.optional(),
	timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).optional(),
	filters: z
		.array(
			z.object({
				field: z.string(),
				op: z.enum([
					"eq",
					"ne",
					"contains",
					"not_contains",
					"starts_with",
					"in",
					"not_in",
				]),
				value: z.union([
					z.string(),
					z.number(),
					z.array(z.union([z.string(), z.number()])),
				]),
				target: z.string().optional(),
				having: z.boolean().optional(),
			})
		)
		.optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
	limit: z.number().min(1).max(1000).optional(),
	timezone: z.string().optional(),
});

type QueryItem = z.infer<typeof queryItemSchema>;

interface QueryItemResult {
	data: unknown[];
	error?: string;
	executionTime: number;
	rowCount: number;
	type: string;
	websiteId?: string;
}

const MAX_MODEL_ROWS = 50;

function resolveDates(item: QueryItem): { from: string; to: string } {
	if (item.from && item.to) {
		return { from: item.from, to: item.to };
	}

	const now = new Date();
	const today = now.toISOString().split("T").at(0) ?? "";

	const daysBack = (d: number) => {
		const date = new Date(now);
		date.setDate(date.getDate() - d);
		return date.toISOString().split("T").at(0) ?? "";
	};

	switch (item.preset) {
		case "today":
			return { from: today, to: today };
		case "yesterday": {
			const y = daysBack(1);
			return { from: y, to: y };
		}
		case "last_7d":
			return { from: daysBack(7), to: today };
		case "last_14d":
			return { from: daysBack(14), to: today };
		case "last_30d":
			return { from: daysBack(30), to: today };
		case "last_90d":
			return { from: daysBack(90), to: today };
		default:
			return { from: daysBack(7), to: today };
	}
}

const BUILDER_CATEGORIES = `Builder types by category:
- Summary: summary_metrics, today_metrics, active_stats
- Traffic: events_by_date, traffic_sources, realtime_pages, realtime_referrers, realtime_countries, realtime_cities, realtime_feed, realtime_sessions, realtime_velocity
- Pages: top_pages, entry_pages, exit_pages, page_performance, page_time_analysis
- Referrers: top_referrers, utm_sources, utm_mediums, utm_campaigns, utm_terms, utm_content
- Devices: browser_name, os_name, screen_resolution, browsers_grouped, device_types, browsers, browser_versions, operating_systems, os_versions, screen_resolutions, viewport_vs_resolution, viewport_patterns
- Geo: country, region, city, timezone, language
- Errors: recent_errors, error_types, error_trends, errors_by_page, error_frequency, error_summary, error_chart_data, errors_by_type
- Performance: slow_pages, performance_by_browser, performance_by_country, performance_by_os, performance_by_region, performance_time_series, load_time_performance, performance_overview
- Vitals: web_vitals_by_page, web_vitals_by_browser, web_vitals_by_country, web_vitals_by_os, web_vitals_by_region, web_vitals_time_series, vitals_overview, vitals_time_series, vitals_by_page, vitals_by_country, vitals_by_browser, vitals_by_region, vitals_by_city
- Sessions: session_metrics, session_duration_distribution, sessions_by_device, sessions_by_browser, sessions_time_series, session_flow, session_pages, interesting_sessions, session_list, session_events
- Custom Events: custom_events, custom_event_properties, custom_events_by_path, custom_events_trends, custom_events_trends_by_event, custom_events_summary, custom_events_property_cardinality, custom_events_recent, custom_events_property_classification, custom_events_property_top_values, custom_events_property_distribution, custom_events_discovery
- Profiles: profile_list, profile_detail, profile_sessions
- Links: outbound_links, outbound_domains, link_total_clicks, link_clicks_by_day, link_referrers_by_day, link_countries_by_day, link_top_referrers, link_top_countries, link_top_regions, link_top_cities, link_top_devices, link_top_browsers
- Engagement: scroll_depth_summary, scroll_depth_distribution, page_scroll_performance, interaction_summary
- Uptime: uptime_overview, uptime_time_series, uptime_status_breakdown, uptime_recent_checks, uptime_response_time_trends, uptime_ssl_status, uptime_by_region
- LLM Analytics: llm_overview_kpis, llm_time_series, llm_provider_breakdown, llm_model_breakdown, llm_finish_reason_breakdown, llm_error_breakdown, llm_cost_by_provider_time_series, llm_cost_by_model_time_series, llm_latency_time_series, llm_latency_by_model, llm_latency_by_provider, llm_slowest_calls, llm_error_rate_time_series, llm_http_status_breakdown, llm_recent_errors, llm_tool_use_time_series, llm_tool_name_breakdown, llm_trace_summary, llm_recent_calls
- Revenue: revenue_overview, revenue_time_series, revenue_by_provider, revenue_by_product, revenue_attribution_overview, revenue_by_country, revenue_by_region, revenue_by_city, revenue_by_browser, revenue_by_device, revenue_by_os, revenue_by_referrer, revenue_by_utm_source, revenue_by_utm_medium, revenue_by_utm_campaign, revenue_by_entry_page, recent_transactions`;

export const getDataTool = tool({
	description: `Run analytics query builders only when the latest user message explicitly asks for website analytics data, metrics, reports, comparisons, breakdowns, trends, revenue, sessions, pages, events, errors, vitals, uptime, LLM usage, links, profiles, or similar quantitative analysis. Do not use for greetings, thanks, acknowledgments, short reactions, clarification-only replies, frustration, or meta-conversation about the assistant/chat. Batch 1-10 queries in parallel. Use preset (last_7d/last_30d/...) or from+to dates. Each query may target a specific website via its websiteId; omit it to use the workspace default. To compare websites, send one query per website with different websiteId values.\n\n${BUILDER_CATEGORIES}`,
	inputSchema: z.object({
		queries: z
			.array(queryItemSchema)
			.min(1)
			.max(10)
			.describe(
				"One to ten explicit analytics query builder requests needed to answer the user's latest data question."
			),
	}),
	execute: async ({ queries }, options) => {
		const ctx = getAppContext(options);
		const batchStart = Date.now();

		const results = await Promise.all(
			queries.map(async (item): Promise<QueryItemResult> => {
				const queryStart = Date.now();

				if (!QueryBuilders[item.type]) {
					return {
						type: item.type,
						data: [],
						rowCount: 0,
						executionTime: 0,
						error: `Unknown query type "${item.type}". Valid types: ${Object.keys(QueryBuilders).join(", ")}`,
					};
				}

				let websiteId: string;
				let resolvedDomain: string | undefined;
				try {
					const resolved = resolveToolWebsite(ctx, item.websiteId);
					websiteId = resolved.websiteId;
					resolvedDomain = resolved.domain;
				} catch (error) {
					return {
						type: item.type,
						websiteId: item.websiteId,
						data: [],
						rowCount: 0,
						executionTime: 0,
						error:
							error instanceof Error ? error.message : "Website not resolved",
					};
				}

				const domain = resolvedDomain || (await getWebsiteDomain(websiteId));
				const { from, to } = resolveDates(item);
				const req: QueryRequest = {
					projectId: websiteId,
					type: item.type,
					from,
					to,
					timeUnit: item.timeUnit,
					filters: item.filters as QueryRequest["filters"],
					groupBy: item.groupBy,
					orderBy: item.orderBy,
					limit: item.limit,
					timezone: item.timezone ?? "UTC",
				};

				const data = await executeQuery(req, domain, req.timezone);
				return {
					type: item.type,
					websiteId,
					data: data.slice(0, MAX_MODEL_ROWS),
					rowCount: data.length,
					executionTime: Date.now() - queryStart,
				};
			})
		);

		const resultMap: Record<string, QueryItemResult> = {};
		for (const r of results) {
			const base = r.websiteId ? `${r.type}@${r.websiteId}` : r.type;
			let key = resultMap[r.type] ? base : r.type;
			let n = 2;
			while (resultMap[key]) {
				key = `${base}#${n++}`;
			}
			resultMap[key] = r;
		}

		return {
			results: resultMap,
			queryCount: queries.length,
			totalExecutionTime: Date.now() - batchStart,
		};
	},
});
