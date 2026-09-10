import { tool } from "ai";
import { z } from "zod";
import { QueryBuilders } from "../../query/builders";
import { allowedFilterFields } from "../../query/simple-builder";

function listAllTypes() {
	return Object.entries(QueryBuilders).map(([name, config]) => ({
		allowedFilters: allowedFilterFields(config),
		allowedFilterOperators: config.allowedFilterOperators,
		name,
		category: config.meta?.category ?? "Uncategorized",
		defaultOrder: config.customSql
			? config.meta?.default_order === undefined
				? "Built-in ordering is undocumented; omit orderBy."
				: config.meta.default_order
			: (config.orderBy ?? null),
		description: config.meta?.description ?? "",
		outputFields: config.meta?.output_fields ?? config.fields ?? null,
		requiredFilters: config.requiredFilters ?? [],
		requiredAnyFilter: config.requiredAnyFilter ?? [],
		tags: config.meta?.tags ?? [],
	}));
}

const ALL_TYPES = listAllTypes();
const CATEGORIES = [...new Set(ALL_TYPES.map((t) => t.category))].sort();

export const discoverQueryTypesTool = tool({
	description:
		"Discover the analytics query builders available to get_data. With no category or keyword, returns a compact catalog of names, descriptions and tags; look up a relevant name for its input contract. A category or keyword returns allowed filters/operators, required selectors, output fields and default order. Null outputFields means undocumented, not an empty result schema. Omit orderBy when ordering is undocumented. No I/O. A category-scoped keyword miss also returns outsideCategory matches without changing the scoped types or count.",
	inputSchema: z.object({
		category: z
			.enum([CATEGORIES[0] ?? "Summary", ...CATEGORIES.slice(1)] as [
				string,
				...string[],
			])
			.nullish()
			.describe(
				`Filter by category, or null to search across all categories. Available: ${CATEGORIES.join(", ")}. Use null when the capability's category is unknown.`
			),
		search: z
			.string()
			.max(60)
			.nullish()
			.describe(
				"One literal keyword or exact builder name, e.g. revenue_overview or retention. Null or empty lists all types in the selected scope. This is substring matching, not semantic search; an empty result only rules out that search in that scope."
			),
	}),
	execute: ({ category, search }) => {
		const needle = search?.trim().toLowerCase();
		const matches = ALL_TYPES.filter((t) => {
			if (needle) {
				const haystack =
					`${t.name} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
				if (!haystack.includes(needle)) {
					return false;
				}
			}
			return true;
		});
		const filtered = category
			? matches.filter((t) => t.category === category)
			: matches;
		const result = {
			categories: CATEGORIES,
			matchCount: filtered.length,
			types:
				category || needle
					? filtered
					: filtered.map(({ name, category, description, tags }) => ({
							name,
							category,
							description,
							tags,
						})),
		};
		if (category && needle && filtered.length === 0) {
			return {
				...result,
				outsideCategory: { matchCount: matches.length, types: matches },
			};
		}
		return result;
	},
});
