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
				op: z.enum(["eq", "ne", "like", "gt", "lt", "in", "notIn"]),
				value: z.union([
					z.string(),
					z.number(),
					z.array(z.union([z.string(), z.number()])),
				]),
			})
		)
		.optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
	limit: z.number().min(1).max(1000).optional(),
	offset: z.number().min(0).optional(),
	timezone: z.string().optional(),
});

export const executeQuery = async (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) => {
	const validated = QuerySchema.parse(request);

	const config = QueryBuilders[validated.type];
	if (!config) {
		throw new Error(`Unknown query type: ${validated.type}`);
	}

	const builder = new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	);
	return await builder.execute();
};

export const compileQuery = (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) => {
	const validated = QuerySchema.parse(request);

	const config = QueryBuilders[validated.type];
	if (!config) {
		throw new Error(`Unknown query type: ${validated.type}`);
	}

	const builder = new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	);
	return builder.compile();
};

export * from "./builders";
export * from "./types";
