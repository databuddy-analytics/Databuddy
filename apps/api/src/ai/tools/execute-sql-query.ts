import { tool } from "ai";
import { z } from "zod";
import {
	executeTimedQuery,
	type QueryResult,
	SQL_VALIDATION_ERROR,
	validateSQL,
} from "./utils";

/**
 * Tool for executing validated, read-only ClickHouse SQL queries.
 * Only SELECT and WITH statements are allowed for security.
 * Cached to improve performance for repeated or similar queries.
 */
export const executeSqlQueryTool = tool({
	description:
		"Executes a validated, read-only ClickHouse SQL query against analytics data. Only SELECT and WITH statements are allowed for security. IMPORTANT: Use parameterized queries with {paramName:Type} syntax (e.g., {limit:UInt32}). The websiteId is automatically included as a parameter. Never use string interpolation or concatenation.",
	inputSchema: z.object({
		websiteId: z
			.string()
			.describe("The website ID to query - automatically added to params"),
		sql: z
			.string()
			.describe(
				"The SQL query to execute. Must be a SELECT or WITH statement. Use parameterized queries with {paramName:Type} syntax. The websiteId parameter is automatically available. Example: SELECT * FROM analytics.events WHERE client_id = {websiteId:String} LIMIT {limit:UInt32}"
			),
		params: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Additional query parameters object matching the parameter names in the SQL query. websiteId is automatically included."
			),
	}),
	execute: async ({ sql, websiteId, params }): Promise<QueryResult> => {
		if (!validateSQL(sql)) {
			throw new Error(SQL_VALIDATION_ERROR);
		}

		const result = await executeTimedQuery("Execute SQL Tool", sql, {
			websiteId,
			...(params ?? {}),
		});

		return result;
	},
});
