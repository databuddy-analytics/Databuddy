/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */
import { z } from "zod";
import { QueryBuilders, suggestQueryTypes } from "./builders";
import { SetupBuilders } from "./builders/setup";
import { SimpleQueryBuilder } from "./simple-builder";
import {
	invalidFilterFieldError,
	resolveRequestTraitFilters,
} from "./trait-filters";
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

function parseRequest(request: QueryRequest): QueryRequest {
	return QuerySchema.parse(request) as QueryRequest;
}

function createBuilder(
	validated: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) {
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

type InsightsSetupCoverageRequest = Omit<QueryRequest, "type">;

type InsightsErrorCohortGoalCompletionRequest = Omit<
	QueryRequest,
	"filters" | "type"
> & {
	errorSelector: {
		field: "message" | "path";
		value: string;
	};
	goalTarget: string;
	goalType: "CUSTOM" | "EVENT" | "PAGE_VIEW";
};

export type InsightsVitalCohortBehaviorRequest = Pick<
	QueryRequest,
	"from" | "projectId" | "to" | "timezone"
> & {
	path: string;
	vitalMetric: "INP" | "LCP";
	vitalThreshold: number;
};

const insightsVitalCohortBehaviorRequestSchema = z.object({
	from: z.string().min(1),
	path: z
		.string()
		.min(1)
		.max(2048)
		.refine(
			(value) =>
				value.trim() === value &&
				value.startsWith("/") &&
				!value.includes("?") &&
				!value.includes("#") &&
				(value === "/" || !value.endsWith("/")),
			"path must be a canonical route"
		),
	projectId: z.string().min(1),
	to: z.string().min(1),
	timezone: z.string().min(1).optional(),
	vitalMetric: z.enum(["LCP", "INP"]),
	vitalThreshold: z.number().finite().positive(),
});

/**
 * Executes the fixed aggregate setup query used by Insights. It deliberately
 * bypasses QueryBuilders so agents cannot discover or invoke this internal
 * enrichment through get_data.
 */
export const executeInsightsSetupCoverageQuery = (
	request: InsightsSetupCoverageRequest,
	websiteDomain?: string | null,
	timezone?: string,
	abortSignal?: AbortSignal
) => {
	const validated = parseRequest({
		...request,
		type: "insights_setup_coverage",
	});
	const config = SetupBuilders.insights_setup_coverage;
	if (!config) {
		throw new Error("Insights setup coverage query is unavailable");
	}
	return new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	).execute(abortSignal);
};

/**
 * Executes the fixed aggregate post-error configured-goal query used only by
 * Insights enrichment. Goal configuration and cohort membership never enter
 * the agent-accessible query registry or its output.
 */
export const executeInsightsErrorCohortGoalCompletionQuery = (
	request: InsightsErrorCohortGoalCompletionRequest,
	websiteDomain?: string | null,
	timezone?: string,
	abortSignal?: AbortSignal
) => {
	const validated = parseRequest({
		...request,
		filters: [
			{
				field: request.errorSelector.field,
				op: "eq",
				value: request.errorSelector.value,
			},
			{ field: "goal_target", op: "eq", value: request.goalTarget },
			{ field: "goal_type", op: "eq", value: request.goalType },
		],
		type: "insights_error_cohort_goal_completion",
	});
	const config = SetupBuilders.insights_error_cohort_goal_completion;
	if (!config) {
		throw new Error(
			"Insights error cohort goal completion query is unavailable"
		);
	}
	return new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	).execute(abortSignal);
};

/**
 * Executes the fixed aggregate continuation comparison for one selected
 * route-vital signal. It deliberately bypasses QueryBuilders: its route,
 * metric threshold, and session cohorts must not be agent-discoverable.
 */
export const executeInsightsVitalCohortBehaviorQuery = (
	request: InsightsVitalCohortBehaviorRequest,
	websiteDomain?: string | null,
	timezone?: string,
	abortSignal?: AbortSignal
) => {
	const input = insightsVitalCohortBehaviorRequestSchema.parse(request);
	const validated = parseRequest({
		filters: [
			{ field: "path", op: "eq", value: input.path },
			{ field: "vital_metric", op: "eq", value: input.vitalMetric },
			{
				field: "vital_threshold",
				op: "eq",
				value: input.vitalThreshold,
			},
		],
		from: input.from,
		projectId: input.projectId,
		to: input.to,
		type: "insights_vital_cohort_behavior",
		timezone: input.timezone,
	});
	const config = SetupBuilders.insights_vital_cohort_behavior;
	if (!config) {
		throw new Error("Insights vital cohort behavior query is unavailable");
	}
	return new SimpleQueryBuilder(
		config,
		{ ...validated, timezone: timezone ?? validated.timezone },
		websiteDomain
	).execute(abortSignal);
};

export const executeQuery = async (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string,
	abortSignal?: AbortSignal
) => {
	const validated = parseRequest(request);
	const filterError = invalidFilterFieldError(
		validated.type,
		validated.filters
	);
	if (filterError) {
		throw new Error(filterError);
	}
	const resolved = await resolveRequestTraitFilters(validated);
	return createBuilder(resolved, websiteDomain, timezone).execute(abortSignal);
};

export const compileQuery = (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) => createBuilder(parseRequest(request), websiteDomain, timezone).compile();

export {
	areQueriesCompatible,
	executeBatch,
	getCompatibleQueries,
	getSchemaGroups,
} from "./batch-executor";
export * from "./builders";
export * from "./expressions";
export { allowedFilterFields, isFilterFieldAllowed } from "./simple-builder";
export {
	hasTraitFilters,
	invalidFilterFieldError,
	publicQueryErrorMessage,
	resolveRequestTraitFilters,
	SANITIZED_QUERY_ERROR,
} from "./trait-filters";
export * from "./types";
