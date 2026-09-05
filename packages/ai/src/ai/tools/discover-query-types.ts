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
		defaultOrder: config.orderBy ?? null,
		description: config.meta?.description ?? "",
		outputFields: config.meta?.output_fields ?? config.fields ?? [],
		requiredFilters: config.requiredFilters ?? [],
		requiredAnyFilter: config.requiredAnyFilter ?? [],
		tags: config.meta?.tags ?? [],
	}));
}

const ALL_TYPES = listAllTypes();
const CATEGORIES = [...new Set(ALL_TYPES.map((t) => t.category))].sort();

export const discoverQueryTypesTool = tool({
	description:
		"List the analytics query builders available to get_data, filtered by category and/or keyword. Call this when you need the right builder or its input contract. Returns allowed filters and operators, required selectors, output fields, and default order alongside the description. Omit orderBy in get_data to retain the default. Cheap to call (no I/O).",
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
			.min(2)
			.max(60)
			.optional()
			.describe(
				"Optional substring match against name, description, and tags (case-insensitive). Useful when you know the dimension ('device', 'utm', 'cron') but not the type name."
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
