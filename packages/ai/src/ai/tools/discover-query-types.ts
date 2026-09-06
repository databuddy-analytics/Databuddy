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
		"List the analytics query builders available to get_data, filtered by category and/or keyword. Call this when you need the right builder or its input contract. Returns allowed filters and operators, required selectors, output fields, and default order alongside the description. Null outputFields means undocumented, not an empty result schema. Custom SQL may have undocumented built-in ordering; omit orderBy to retain it. Cheap to call (no I/O).",
	inputSchema: z.object({
		category: z
			.enum([CATEGORIES[0] ?? "Summary", ...CATEGORIES.slice(1)] as [
				string,
				...string[],
			])
			.optional()
			.describe(
				`Filter by category. Available: ${CATEGORIES.join(", ")}. Omit to list everything.`
			),
		search: z
			.string()
			.max(60)
			.optional()
			.describe(
				"One literal keyword or exact builder name, e.g. revenue_overview or retention. Use an empty string to list the category. Full questions are not semantic searches; a missing narrow match does not prove the category lacks the capability."
			),
	}),
	execute: ({ category, search }) => {
		const needle = search?.trim().toLowerCase();
		const filtered = ALL_TYPES.filter((t) => {
			if (category && t.category !== category) {
				return false;
			}
			if (needle) {
				const haystack =
					`${t.name} ${t.description} ${t.tags.join(" ")}`.toLowerCase();
				if (!haystack.includes(needle)) {
					return false;
				}
			}
			return true;
		});
		return {
			categories: CATEGORIES,
			matchCount: filtered.length,
			types: filtered,
		};
	},
});
