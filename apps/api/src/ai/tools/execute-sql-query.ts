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
		"Executes a validated, read-only ClickHouse SQL query against analytics data. Only SELECT and WITH statements are allowed for security. IMPORTANT: Use parameterized queries with {paramName:Type} syntax (e.g., {websiteId:String}, {limit:UInt32}). Never use string interpolation or concatenation.",
	inputSchema: z.object({
		sql: z
			.string()
			.describe(
				"The SQL query to execute. Must be a SELECT or WITH statement. Use parameterized queries with {paramName:Type} syntax. Example: SELECT * FROM analytics.events WHERE client_id = {websiteId:String} LIMIT {limit:UInt32}"
			),
		params: z
			.record(z.string(), z.unknown())
			.optional()
			.describe(
				"Query parameters object matching the parameter names in the SQL query."
			),
	}),
	execute: async ({ sql, params }): Promise<QueryResult> => {
		if (!validateSQL(sql)) {
			throw new Error(SQL_VALIDATION_ERROR);
		}

		const result = await executeTimedQuery(
			"Execute SQL Tool",
			sql,
			params ?? {}
		);

		return result;
	},
});