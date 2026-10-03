/** biome-ignore-all lint/performance/noBarrelFile: this is a barrel file */
import { readBooleanEnv } from "@databuddy/env/boolean";
import { getBillingOwner } from "@databuddy/rpc/billing";
import { getOrganizationOwnerId } from "@databuddy/rpc/organization";
import {
	type GatedFeatureId,
	GATED_FEATURES,
	getFeatureUnavailableMessage,
	getNextPlanForFeature,
	isFeatureAvailable,
} from "@databuddy/shared/types/features";
import { z } from "zod";
import { getCachedWebsite } from "../lib/website-utils";
import { getQueryBuilder, suggestQueryTypes } from "./builders";
import { SimpleQueryBuilder } from "./simple-builder";
import {
	invalidFilterFieldError,
	resolveRequestTraitFilters,
} from "./trait-filters";
import type {
	CompiledQuery,
	FilterOperators,
	QueryRequest,
	TimeGranularity,
} from "./types";

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

export const QueryFilterSchema = z.object({
	field: z.string(),
	op: filterOpEnum,
	value: z.union([
		z.string(),
		z.number(),
		z.array(z.union([z.string(), z.number()])),
	]),
	target: z.string().optional(),
	having: z.boolean().optional(),
});

export const MAX_QUERY_ROWS = 1000;

const QuerySchema = z.object({
	projectId: z.string(),
	type: z.string(),
	from: z.string(),
	to: z.string(),
	timeUnit: timeUnitEnum.default("day"),
	filters: z.array(QueryFilterSchema).optional(),
	groupBy: z.array(z.string()).optional(),
	orderBy: z.string().optional(),
	limit: z.number().int().min(1).max(MAX_QUERY_ROWS).optional(),
	offset: z.number().int().min(0).optional(),
	timezone: z.string().optional(),
});

function parseRequest(request: QueryRequest): QueryRequest {
	return QuerySchema.parse(request);
}

function createBuilder(
	validated: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) {
	const config = getQueryBuilder(validated.type);
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
	abortSignal?: AbortSignal,
	onCompiled?: (query: CompiledQuery) => void
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
	return createBuilder(resolved, websiteDomain, timezone).execute(
		abortSignal,
		onCompiled
	);
};

const PLAN_GATED_QUERY_CATEGORIES: Record<string, GatedFeatureId> = {
	Errors: GATED_FEATURES.ERROR_TRACKING,
};

export async function queryPlanGateError(
	queryTypes: string[],
	scope: { organizationId: string | null } | { websiteId: string }
): Promise<string | null> {
	if (readBooleanEnv("SELFHOST")) {
		return null;
	}
	const required = new Set<GatedFeatureId>();
	for (const type of queryTypes) {
		const category = getQueryBuilder(type)?.meta?.category;
		const feature = category && PLAN_GATED_QUERY_CATEGORIES[category];
		if (feature) {
			required.add(feature);
		}
	}
	if (required.size === 0) {
		return null;
	}

	const organizationId =
		"websiteId" in scope
			? ((await getCachedWebsite(scope.websiteId))?.organizationId ?? null)
			: scope.organizationId;
	const ownerId = organizationId
		? await getOrganizationOwnerId(organizationId)
		: null;
	const planId = ownerId
		? (await getBillingOwner(ownerId, organizationId)).planId
		: null;

	for (const feature of required) {
		if (!isFeatureAvailable(planId, feature)) {
			return getFeatureUnavailableMessage(
				feature,
				getNextPlanForFeature(planId, feature)
			);
		}
	}
	return null;
}

export const compileQuery = (
	request: QueryRequest,
	websiteDomain?: string | null,
	timezone?: string
) => createBuilder(parseRequest(request), websiteDomain, timezone).compile();

export { executeBatch, truncateQueryErrorForLog } from "./batch-executor";
export * from "./builders";
export * from "./expressions";
export { allowedFilterFields, isFilterFieldAllowed } from "./simple-builder";
export {
	invalidFilterFieldError,
	publicQueryErrorMessage,
	SANITIZED_QUERY_ERROR,
} from "./trait-filters";
export * from "./types";
