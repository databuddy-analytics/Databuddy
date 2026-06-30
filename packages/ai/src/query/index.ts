/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */
import { z } from "zod";
import { QueryBuilders, suggestQueryTypes } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import type { FilterOperators, QueryRequest, TimeGranularity } from "./types";

const FILTER_OPS = [
	"eq",
	"ne",
	"contains",
	"not_contains",
	"starts_with",
	"in",
	"not_in",
] as const satisfies readonly (keyof typeof FilterOperators)[];

const TIME_UNITS = [
	"minute",
	"hour",
	"day",
	"week",
	"month",
	"hourly",
	"daily",
] as const satisfies readonly (
	| keyof typeof TimeGranularity
	| "hourly"
	| "daily"
)[];

const filterOpEnum = z.enum(FILTER_OPS);
const timeUnitEnum = z.enum(TIME_UNITS);

const QuerySchema = z.object({
	projectId: z.string(),
	type: z.string(),
	from: z.string(),
	to: z.string(),
	timeUnit: timeUnitEnum.default("day"),
	filters: z
		.array(
			z.object({
				field: z.string(),
				op: filterOpEnum,
				value: z.union([
					z.string(),
					z.number(),
					z.array(z.union([z.string(), z.number()])),
				]),
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

function createBuilder(
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) {
	const validated = QuerySchema.parse(request) as QueryRequest;
	const config = QueryBuilders[validated.type];
	if (!config) {
		const suggestions = suggestQueryTypes(validated.type);
		const hint = suggestions.length
			? ` Did you mean: ${suggestions.join(", ")}?`
			: " Call the 'capabilities' tool with include=['queryTypes'] to see all available types.";
		throw new Error(`Unknown query type: ${validated.type}.${hint}`);
	}
	return new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	);
}

export const executeQuery = async (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string,
	abortSignal?: AbortSignal
) => createBuilder(request, websiteDomain, timezone).execute(abortSignal);

export const compileQuery = (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) => createBuilder(request, websiteDomain, timezone).compile();

export {
	areQueriesCompatible,
	executeBatch,
	getCompatibleQueries,
	getSchemaGroups,
} from "./batch-executor";
export * from "./builders";
export * from "./expressions";
export { allowedFilterFields, isFilterFieldAllowed } from "./simple-builder";
export * from "./types";
