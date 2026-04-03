import { tool } from "ai";
import { z } from "zod";
import { executeQuery } from "../../query";
import { QueryBuilders } from "../../query/builders";
import type { QueryRequest } from "../../query/types";
import {
	insightsOutputSchema,
	type ParsedInsight,
} from "../schemas/smart-insights-output";

const QUERY_FETCH_TIMEOUT_MS = 45_000;
const MAX_TOOL_RESPONSE_CHARS = 48_000;
const MAX_QUERIES_PER_CALL = 8;
const DEFAULT_LIMIT = 10;

/**
 * Curated allowlist — only query types safe for automated insight generation
 * (no arbitrary SQL, no cross-website access).
 */
const INSIGHTS_AGENT_QUERY_TYPES = [
	"summary_metrics",
	"top_pages",
	"error_summary",
	"top_referrers",
	"country",
	"browser_name",
	"os_name",
	"vitals_overview",
	"entry_pages",
	"exit_pages",
	"page_time_analysis",
	"traffic_sources",
	"utm_sources",
	"utm_mediums",
	"custom_events_discovery",
	"custom_events_summary",
] as const;

const INSIGHTS_TYPE_LIST = INSIGHTS_AGENT_QUERY_TYPES.join(", ");

function isAllowedQueryType(type: string): boolean {
	return (
		(INSIGHTS_AGENT_QUERY_TYPES as readonly string[]).includes(type) &&
		type in QueryBuilders
	);
}

function runQueryWithTimeout<T>(
	label: string,
	fn: () => Promise<T>
): Promise<T> {
	return Promise.race([
		fn(),
		new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`${label} timed out`));
			}, QUERY_FETCH_TIMEOUT_MS);
		}),
	]);
}

export interface InsightsAgentPeriodBounds {
	current: { from: string; to: string };
	previous: { from: string; to: string };
}

export interface CreateInsightsAgentToolsParams {
	domain: string;
	periodBounds: InsightsAgentPeriodBounds;
	timezone: string;
	websiteId: string;
}

export function createInsightsAgentTools(
	params: CreateInsightsAgentToolsParams
) {
	let submittedInsights: ParsedInsight[] | null = null;

	const singleQuerySchema = z.object({
		type: z
			.string()
			.describe(`Analytics query type. Allowed: ${INSIGHTS_TYPE_LIST}`)
			.refine(isAllowedQueryType, "Unknown or disallowed query type"),
		limit: z
			.number()
			.min(1)
			.max(50)
			.optional()
			.describe(
				"Row limit for list-style queries (top_pages, referrers, etc.)"
			),
	});

	const insightQueryTool = tool({
		description:
			"Fetch analytics data for the **current** or **previous** week-over-week period. Batch multiple query types in one call (up to 8). Use summary_metrics early, then add top_pages, errors, referrers, geo, browsers, vitals, or custom events as needed. Compare both periods before calling submit_insights.",
		inputSchema: z.object({
			period: z
				.enum(["current", "previous"])
				.describe(
					"Which WoW window: current week vs previous week (same calendar alignment as smart insights)."
				),
			queries: z.array(singleQuerySchema).min(1).max(MAX_QUERIES_PER_CALL),
		}),
		execute: async ({ period, queries }) => {
			const range =
				period === "current"
					? params.periodBounds.current
					: params.periodBounds.previous;

			const results: Array<{
				type: string;
				rowCount: number;
				data: unknown[];
			}> = [];

			for (const q of queries) {
				if (!isAllowedQueryType(q.type)) {
					results.push({
						type: q.type,
						rowCount: 0,
						data: [],
					});
					continue;
				}

				const limit = q.limit ?? (q.type === "top_pages" ? 10 : DEFAULT_LIMIT);
				const req: QueryRequest = {
					projectId: params.websiteId,
					type: q.type,
					from: range.from,
					to: range.to,
					timezone: params.timezone,
					limit: q.type === "vitals_overview" ? undefined : limit,
				};

				try {
					const data = (await runQueryWithTimeout(
						`insight_query:${q.type}`,
						() => executeQuery(req, params.domain, params.timezone)
					)) as Record<string, unknown>[];
					results.push({
						type: q.type,
						rowCount: Array.isArray(data) ? data.length : 0,
						data: Array.isArray(data) ? data : [],
					});
				} catch {
					results.push({
						type: q.type,
						rowCount: 0,
						data: [],
					});
				}
			}

			let payload = JSON.stringify(
				{
					period,
					range,
					results,
				},
				null,
				0
			);
			if (payload.length > MAX_TOOL_RESPONSE_CHARS) {
				payload = `${payload.slice(0, MAX_TOOL_RESPONSE_CHARS)}\n…[truncated]`;
			}

			return payload;
		},
	});

	const submitInsightsTool = tool({
		description:
			"Submit your final 1-3 smart insights after you have queried enough data from both weeks. Call exactly once when ready.",
		inputSchema: insightsOutputSchema,
		execute: (data) => {
			submittedInsights = data.insights;
			return {
				ok: true,
				count: data.insights.length,
				message: "Insights accepted.",
			};
		},
	});

	return {
		tools: {
			insight_query: insightQueryTool,
			submit_insights: submitInsightsTool,
		},
		getSubmittedInsights: (): ParsedInsight[] | null => submittedInsights,
	};
}
