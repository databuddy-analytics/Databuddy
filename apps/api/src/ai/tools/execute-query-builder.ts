import { tool } from "ai";
import { z } from "zod";
import { getWebsiteDomain } from "../../lib/website-utils";
import { executeQuery, QueryBuilders } from "../../query";
import type { QueryRequest } from "../../query/types";
import { createToolLogger } from "./utils/logger";

const QueryBuilderInputSchema = z.object({
	websiteId: z.string().describe("The website ID to query"),
	type: z
		.string()
		.describe(
			`The query type to execute. Available types: ${Object.keys(QueryBuilders).join(", ")}`
		),
	from: z.string().describe("Start date in ISO format (e.g., 2024-01-01)"),
	to: z.string().describe("End date in ISO format (e.g., 2024-01-31)"),
	timeUnit: z
		.enum(["minute", "hour", "day", "week", "month"])
		.optional()
		.describe("Time granularity for the query"),
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
		.optional()
		.describe("Filters to apply to the query"),
	groupBy: z.array(z.string()).optional().describe("Fields to group by"),
	orderBy: z.string().optional().describe("Field to order by"),
	limit: z
		.number()
		.min(1)
		.max(1000)
		.optional()
		.describe("Maximum number of results"),
	offset: z.number().min(0).optional().describe("Number of results to skip"),
	timezone: z
		.string()
		.optional()
		.describe("Timezone for date operations (default: UTC)"),
	websiteDomain: z
		.string()
		.optional()
		.describe("Website domain (optional, will be fetched if not provided)"),
});

type QueryBuilderInput = z.infer<typeof QueryBuilderInputSchema>;

/**
 * Tool for executing pre-built queries using the query builder system.
 * This provides a safe, structured way to query analytics data without writing raw SQL.
 * Use this for common analytics queries like page views, sessions, traffic, etc.
 * For custom queries, use execute_sql_query instead.
 */
export const executeQueryBuilderTool = tool({
	description: `Executes a pre-built analytics query using the query builder system. Available query types: ${Object.keys(QueryBuilders).join(", ")}. This is the preferred method for common analytics queries as it provides type safety and automatic optimization. Use execute_sql_query only when you need custom SQL that isn't covered by these builders.`,
	inputSchema: QueryBuilderInputSchema,
	execute: async (
		input: QueryBuilderInput
	): Promise<{
		data: unknown[];
		executionTime: number;
		rowCount: number;
		type: string;
	}> => {
		const logger = createToolLogger("Execute Query Builder");
		const queryStart = Date.now();

		try {
			// Validate query type exists
			if (!QueryBuilders[input.type]) {
				throw new Error(
					`Unknown query type: ${input.type}. Available types: ${Object.keys(QueryBuilders).join(", ")}`
				);
			}

			// Fetch website domain if not provided
			const websiteDomain =
				input.websiteDomain ?? (await getWebsiteDomain(input.websiteId));

			// Build query request
			const queryRequest: QueryRequest = {
				projectId: input.websiteId,
				type: input.type,
				from: input.from,
				to: input.to,
				timeUnit: input.timeUnit,
				filters: input.filters,
				groupBy: input.groupBy,
				orderBy: input.orderBy,
				limit: input.limit,
				offset: input.offset,
				timezone: input.timezone ?? "UTC",
			};

			// Execute query
			const data = await executeQuery(
				queryRequest,
				websiteDomain,
				queryRequest.timezone
			);

			const executionTime = Date.now() - queryStart;

			logger.info("Query builder executed", {
				type: input.type,
				executionTime: `${executionTime}ms`,
				rowCount: data.length,
				from: input.from,
				to: input.to,
			});

			return {
				data,
				executionTime,
				rowCount: data.length,
				type: input.type,
			};
		} catch (error) {
			const executionTime = Date.now() - queryStart;

			logger.error("Query builder failed", {
				type: input.type,
				executionTime: `${executionTime}ms`,
				error: error instanceof Error ? error.message : "Unknown error",
			});

			throw error instanceof Error
				? error
				: new Error("Query builder execution failed");
		}
	},
});
