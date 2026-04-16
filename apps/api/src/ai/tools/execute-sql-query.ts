import {
	AGENT_SQL_VALIDATION_ERROR,
	requiresTenantFilter,
	validateAgentSQL,
} from "@databuddy/db/clickhouse";
import { tool } from "ai";
import { z } from "zod";
import { executeTimedQuery, type QueryResult } from "./utils";

export const executeSqlQueryTool = tool({
	description: `Read-only ClickHouse SQL (SELECT/WITH only). Must use {paramName:Type} placeholders (no string interpolation) and filter by client_id = {websiteId:String}. websiteId is auto-added to params.

Tables: analytics.events (client_id, anonymous_id, session_id, time, path, referrer, browser_name, os_name, device_type, country, region, city, utm_*, load_time, time_on_page, scroll_depth, properties), analytics.error_spans (message, filename, lineno, stack, error_type), analytics.web_vitals_spans (metric_name FCP/LCP/CLS/INP/TTFB/FPS, metric_value), analytics.outgoing_links (href, text). Custom events are in analytics.custom_events (keyed by owner_id, not client_id) — use get_data custom_events_* builders instead. Prefer get_data query builders for anything they cover.`,
	strict: true,
	inputSchema: z.object({
		websiteId: z.string(),
		sql: z.string(),
		params: z.record(z.string(), z.unknown()).optional(),
	}),
	execute: async ({ sql, websiteId, params }): Promise<QueryResult> => {
		const validation = validateAgentSQL(sql);
		if (!validation.valid) {
			throw new Error(validation.reason ?? AGENT_SQL_VALIDATION_ERROR);
		}

		if (!requiresTenantFilter(sql)) {
			throw new Error(
				"Query must include tenant isolation: WHERE client_id = {websiteId:String}"
			);
		}

		const result = await executeTimedQuery("Execute SQL Tool", sql, {
			websiteId,
			...(params ?? {}),
		});

		// Truncate large results to save context tokens.
		const MAX_MODEL_ROWS = 50;
		if (result.data.length > MAX_MODEL_ROWS) {
			return {
				...result,
				data: result.data.slice(0, MAX_MODEL_ROWS),
			};
		}

		return result;
	},
});
