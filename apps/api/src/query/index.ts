/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */
import { z } from "zod";
import { QueryBuilders } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { QueryRequest } from "./types";

const QuerySchema = z.object({
	projectId: z.string(),
	type: z.string(),
	from: z.string(),
	to: z.string(),
	timeUnit: z.enum(["minute", "hour", "day", "week", "month"]).default("day"),
	filters: z
		.array(
			z.object({
				field: z.string(),
				op: z.enum([
					"eq",
					"ne",
					"like",
					"ilike",
					"notLike",
					"gt",
					"gte",
					"lt",
					"lte",
					"in",
					"notIn",
					"isNull",
					"isNotNull",
				]),
				value: z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
				target: z.string().optional(),
				having: z.boolean().optional(),
			})
		)
		.optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
	limit: z.number().min(1).max(1000).optional(),
	offset: z.number().min(0).optional(),
	timezone: z.string().optional(),
});

function createBuilder(request: QueryRequest, websiteDomain?: string | null, timezone?: string) {
	const validated = QuerySchema.parse(request);
	const config = QueryBuilders[validated.type];
	if (!config) {
		throw new Error(`Unknown query type: ${validated.type}`);
	}
	return new SimpleQueryBuilder(config, { ...validated, timezone: timezone ?? validated.timezone }, websiteDomain);
}

export const executeQuery = async (request: QueryRequest, websiteDomain?: string | null, timezone?: string) =>
	createBuilder(request, websiteDomain, timezone).execute();

export const compileQuery = (request: QueryRequest, websiteDomain?: string | null, timezone?: string) =>
	createBuilder(request, websiteDomain, timezone).compile();

export { areQueriesCompatible, executeBatch, getCompatibleQueries, getSchemaGroups } from "./batch-executor";
export * from "./builders";
export * from "./expressions";
export * from "./types";
