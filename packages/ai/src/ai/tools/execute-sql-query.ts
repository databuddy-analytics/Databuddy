import { tool } from "ai";
import { z } from "zod";
import {
	executeTimedQuery,
	getAppContext,
	type QueryResult,
	resolveToolWebsite,
} from "./utils";

const MAX_MODEL_ROWS = 50;
const PAGEVIEW_EVENT_PATTERN = /\bevent_name\s*=\s*(['"])pageview\1/i;

const sqlParamScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const sqlParamsSchema = z.record(
	z.string(),
	z.union([sqlParamScalar, z.array(sqlParamScalar)])
);

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
	params?: z.infer<typeof sqlParamsSchema>;
	toolName?: string;
	abortSignal?: AbortSignal;
}): Promise<QueryResult> {
	if (PAGEVIEW_EVENT_PATTERN.test(sql)) {
		throw new Error(
			"Invalid pageview event name: use event_name = 'screen_view', never 'pageview'."
		);
	}

	const { websiteId: _, websiteDomain: __, ...rest } = params ?? {};
	const result = await executeTimedQuery(
		toolName,
		{
			sql,
			params: websiteDomain
				? { ...rest, websiteId, websiteDomain }
				: { ...rest, websiteId },
			websiteId,
		},
		abortSignal
	);

	return result.data.length > MAX_MODEL_ROWS
		? { ...result, data: result.data.slice(0, MAX_MODEL_ROWS) }
		: result;
}

export const executeSqlQueryTool = tool({
	description: `Read-only ClickHouse SQL for session-level joins, path analysis, or cross-table correlations the get_data builders can't express. SELECT/WITH only, without comments or comma joins; {paramName:Type} placeholders only. Rows are already scoped to the target website. Footguns: analytics.events uses "time" as its timestamp column ("timestamp" elsewhere); pageviews are event_name = 'screen_view' (never 'pageview'); use uniq() not COUNT(DISTINCT); quantileTDigest on a Decimal column needs toFloat64() cast; session sets selected by different events can overlap, so never add or compare them as exclusive cohorts unless the query makes them exclusive.`,
	strict: true,
	inputSchema: z.object({
		sql: z
			.string()
			.describe(
				"Read-only ClickHouse SELECT/WITH query. Rows are already scoped to the target website, so no tenant filter is needed."
			),
		websiteId: z
			.string()
			.optional()
			.describe(
				"Target website id. Omit to use the workspace default. Get ids from list_websites. The {websiteId:String} placeholder is bound to this site server-side."
			),
		params: sqlParamsSchema
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
