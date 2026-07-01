import { tool } from "ai";
import { z } from "zod";
import { QueryBuilders } from "../../query/builders";

interface DiscoveredType {
	category: string;
	description: string;
	name: string;
	tags: string[];
}

function listAllTypes(): DiscoveredType[] {
	return Object.entries(QueryBuilders).map(([name, config]) => ({
		name,
		category: config.meta?.category ?? "Uncategorized",
		description: config.meta?.description ?? "",
		tags: config.meta?.tags ?? [],
	}));
}

const ALL_TYPES = listAllTypes();
const CATEGORIES = [...new Set(ALL_TYPES.map((t) => t.category))].sort();

export const discoverQueryTypesTool = tool({
	description: `List the analytics query builders available to get_data, filtered by category and/or keyword. Call this when you don't know which builder fits the user's ask (especially for breakdowns by a dimension you haven't used before — try category="Performance" or search="device"). Returns name, category, description, and tags. Cheap to call (no I/O); the result lets you pick the right type before calling get_data.`,
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
