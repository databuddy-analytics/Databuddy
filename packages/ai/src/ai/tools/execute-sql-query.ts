import {
	AGENT_SQL_VALIDATION_ERROR,
	buildAdditionalTableFilters,
	extractAllowlistedTables,
	validateAgentSQL,
} from "@databuddy/db/clickhouse";
import { tool } from "ai";
import { z } from "zod";
import {
	executeTimedQuery,
	getAppContext,
	type QueryResult,
	resolveToolWebsite,
} from "./utils";

const MAX_MODEL_ROWS = 50;

function withServerBoundIds(
	params: Record<string, unknown> | undefined,
	websiteId: string,
	websiteDomain: string | undefined
): Record<string, unknown> {
	const { websiteId: _, websiteDomain: __, ...rest } = params ?? {};
	return websiteDomain
		? { ...rest, websiteId, websiteDomain }
		: { ...rest, websiteId };
}

export async function executeAgentSqlForWebsite({
	websiteId,
	websiteDomain,
	sql,
	params,
	toolName = "Execute SQL Tool",
}: {
	websiteId: string;
	websiteDomain?: string;
	sql: string;
	params?: Record<string, unknown>;
	toolName?: string;
}): Promise<QueryResult> {
	const validation = validateAgentSQL(sql);
	if (!validation.valid) {
		throw new Error(validation.reason ?? AGENT_SQL_VALIDATION_ERROR);
	}

	const referencedTables = extractAllowlistedTables(sql);
	const additional_table_filters = buildAdditionalTableFilters(
		referencedTables,
		websiteId
	);

	const result = await executeTimedQuery(
		toolName,
		sql,
		withServerBoundIds(params, websiteId, websiteDomain),
		{ websiteId },
		{
			additional_table_filters,
			max_execution_time: 20,
			max_memory_usage: 1_000_000_000,
			max_rows_to_read: 100_000_000,
			max_bytes_to_read: 5_000_000_000,
			read_overflow_mode: "throw",
			max_result_rows: 100_000,
			max_result_bytes: 50_000_000,
			result_overflow_mode: "break",
			use_query_cache: 0,
		}
	);

	return result.data.length > MAX_MODEL_ROWS
		? { ...result, data: result.data.slice(0, MAX_MODEL_ROWS) }
		: result;
}

export const executeSqlQueryTool = tool({
	description: `Read-only ClickHouse SQL for session-level joins, path analysis, or cross-table correlations. Prefer get_data query builders for anything they cover. SELECT/WITH only, CTEs instead of subqueries/UNION.

Tenant filter: every WHERE needs client_id = {websiteId:String} (for events, error_spans, vitals, blocked_traffic) or owner_id = {websiteId:String} (for custom_events, revenue). Use {paramName:Type} placeholders only.

Tables:
- analytics.events: session_id, time, path, referrer, browser_name, os_name, device_type, country, region, city, utm_source, utm_medium, utm_campaign, time_on_page, scroll_depth, event_name
- analytics.error_spans: session_id, timestamp, path, message, filename, lineno, stack, error_type
- analytics.web_vitals_spans: timestamp, path, metric_name (FCP/LCP/CLS/INP/TTFB/FPS), metric_value
- analytics.custom_events: event_name, timestamp, properties (JSON), session_id
- analytics.revenue: transaction_id, amount Decimal(18,4), currency, provider, type, customer_id, created
- analytics.outgoing_links: timestamp, path, href, text

Gotchas: timestamp column is "time" in events, "timestamp" elsewhere. Pageviews = event_name = 'screen_view'. Use uniq() not COUNT(DISTINCT). quantileTDigest on Decimal needs toFloat64() cast.`,
	strict: true,
	inputSchema: z.object({
		sql: z
			.string()
			.describe(
				"Read-only ClickHouse SELECT/WITH query for an explicit analytics request. Must include client_id = {websiteId:String} AND-ed at the top level of every SELECT's WHERE."
			),
		websiteId: z
			.string()
			.optional()
			.describe(
				"Target website id. Omit to use the workspace default. Get ids from list_websites. The {websiteId:String} placeholder is bound to this site server-side."
			),
		params: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Optional typed placeholder values. websiteId and websiteDomain are bound by the server and cannot be overridden."
			),
	}),
	execute: ({ sql, websiteId, params }, options): Promise<QueryResult> => {
		const ctx = getAppContext(options);
		const resolved = resolveToolWebsite(ctx, websiteId);
		return executeAgentSqlForWebsite({
			websiteId: resolved.websiteId,
			websiteDomain: resolved.domain,
			sql,
			params,
		});
	},
});
