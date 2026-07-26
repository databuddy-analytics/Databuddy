import {
	isTraitFilterField,
	resolveTraitSegment,
	type TraitFilter,
	TraitFilterError,
} from "@databuddy/services/identity";
import { QueryBuilders } from "./builders";
import { allowedFilterFields, isFilterFieldAllowed } from "./simple-builder";
import type { Filter, QueryRequest } from "./types";

export const SANITIZED_QUERY_ERROR = "Query failed";

const PUBLIC_QUERY_ERROR_PATTERNS = [
	/^Unknown query type:/,
	/^Filter on field '[^']+' is not permitted/,
	/^Grouping by '[^']+' is not permitted/,
	/^Ordering by '[^']+' is not permitted/,
	/^Missing required filters?:/,
	/^Trait filters /,
	/^Trait segment exceeds /,
	/^[a-z_]+ filter is required for [a-z_]+ query$/,
	/^[a-z_]+ filter expects /,
];

export function hasTraitFilters(filters: Filter[] | undefined): boolean {
	return Boolean(filters?.some((f) => isTraitFilterField(f.field)));
}

export function publicQueryErrorMessage(error: unknown): string {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "";
	if (!message) {
		return SANITIZED_QUERY_ERROR;
	}
	return PUBLIC_QUERY_ERROR_PATTERNS.some((pattern) => pattern.test(message))
		? message
		: SANITIZED_QUERY_ERROR;
}

export function invalidFilterFieldError(
	type: string,
	filters: Filter[] | undefined
): string | null {
	const config = QueryBuilders[type];
	if (!(config && filters?.length)) {
		return null;
	}
	const disallowed = filters.find(
		(f) =>
			!(
				f.target ||
				f.having ||
				isTraitFilterField(f.field) ||
				isFilterFieldAllowed(config, f.field)
			)
	);
	if (!disallowed) {
		return null;
	}
	const allowed = allowedFilterFields(config).sort().join(", ");
	return `Filter on field '${disallowed.field}' is not permitted for ${type}. Allowed fields: ${allowed}. Identified-user traits can be filtered with trait:<key> (e.g. trait:plan) on query types that accept profile_id.`;
}

export async function resolveRequestTraitFilters(
	request: QueryRequest
): Promise<QueryRequest> {
	if (!hasTraitFilters(request.filters)) {
		return request;
	}
	if (request.organizationWebsiteIds) {
		throw new TraitFilterError(
			"Trait filters are only supported for website-scoped queries."
		);
	}
	const config = QueryBuilders[request.type];
	if (!(config && isFilterFieldAllowed(config, "profile_id"))) {
		throw new TraitFilterError(
			`Trait filters are not supported for ${request.type}. Query types that support them accept a profile_id filter.`
		);
	}
	const filters = request.filters ?? [];
	const traitFilters = filters.filter((f) => isTraitFilterField(f.field));
	const segment = await resolveTraitSegment(
		request.projectId,
		traitFilters as TraitFilter[]
	);
	return {
		...request,
		filters: [
			...filters.filter((f) => !isTraitFilterField(f.field)),
			{ field: "profile_id", op: "in", value: segment },
		],
	};
}
