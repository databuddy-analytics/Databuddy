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

function describeMatches(types: typeof ALL_TYPES, hasSearch: boolean) {
	const detail = hasSearch && types.length === 1 ? "full" : "summary";
	return {
		detail,
		matchCount: types.length,
		types:
			detail === "full"
				? types
				: types.map(({ name, category, description, tags }) => ({
						name,
						category,
						description,
						tags,
					})),
	};
}

export const discoverQueryTypesTool = tool({
	description:
		"Discover analytics builders available to get_data. Exact builder names take precedence over substring matches. An exact name or unique keyword match returns detail=full: allowed filters/operators, required selectors, output fields and default order. Browsing or multiple matches returns detail=summary: names, categories, descriptions and tags; search an exact name for its full contract. A category-scoped keyword miss also returns outsideCategory matches without changing the scoped types or count. Null outputFields means undocumented; omit orderBy when ordering is undocumented. No I/O.",
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
		const exact =
			needle && ALL_TYPES.find((t) => t.name.toLowerCase() === needle);
		const matches = exact
			? [exact]
			: ALL_TYPES.filter(
					(t) =>
						!needle ||
						`${t.name} ${t.description} ${t.tags.join(" ")}`
							.toLowerCase()
							.includes(needle)
				);
		const scoped = category
			? matches.filter((t) => t.category === category)
			: matches;
		const result = {
			categories: CATEGORIES,
			...describeMatches(scoped, Boolean(needle)),
		};
		if (category && needle && scoped.length === 0) {
			return { ...result, outsideCategory: describeMatches(matches, true) };
		}
		return result;
	},
});
