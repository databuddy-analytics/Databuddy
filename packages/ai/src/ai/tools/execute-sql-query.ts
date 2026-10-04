import {
	AGENT_TENANT_COLUMN_BY_TABLE,
	AGENT_TENANT_FILTERS,
	buildAdditionalTableFilters,
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
	abortSignal,
}: {
	websiteId: string;
	websiteDomain?: string;
	sql: string;
	params?: Record<string, unknown>;
	toolName?: string;
	abortSignal?: AbortSignal;
}): Promise<QueryResult> {
	const validation = validateAgentSQL(sql);
	if (!validation.valid) {
		throw new Error(validation.reason);
	}

	const additional_table_filters = buildAdditionalTableFilters(
		Object.keys(AGENT_TENANT_COLUMN_BY_TABLE),
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
		},
		abortSignal
	);

	return result.data.length > MAX_MODEL_ROWS
		? { ...result, data: result.data.slice(0, MAX_MODEL_ROWS) }
		: result;
}

export const executeSqlQueryTool = tool({
	description: `Read-only ClickHouse SQL for session-level joins, path analysis, or cross-table correlations the get_data builders can't express. SELECT/WITH only; use CTEs instead of subqueries/UNION; {paramName:Type} placeholders only. Footguns: analytics.events uses "time" as its timestamp column ("timestamp" elsewhere); pageviews are event_name = 'screen_view' (never 'pageview'); use uniq() not COUNT(DISTINCT); quantileTDigest on a Decimal column needs toFloat64() cast; session sets selected by different events can overlap, so never add or compare them as exclusive cohorts unless the query makes them exclusive.`,
	strict: true,
	inputSchema: z.object({
		sql: z
			.string()
			.describe(
				`Read-only ClickHouse SELECT/WITH query. Every SELECT that reads a table ANDs that table's tenant filter at the top level of its WHERE: ${AGENT_TENANT_FILTERS}.`
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
			abortSignal: options.abortSignal,
		});
	},
});
