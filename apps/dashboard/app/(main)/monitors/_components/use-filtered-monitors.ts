import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMemo } from "react";

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

export function useFilteredList<T extends { createdAt: Date | string }>(
	items: T[],
	searchQuery: string,
	sortBy: SortOption,
	searchFields: (item: T) => [string, ...(string | null | undefined)[]]
): T[] {
	const [debouncedSearch] = useDebouncedValue(searchQuery, { wait: 200 });

	return useMemo(() => {
		const query = debouncedSearch.trim().toLowerCase();
		const result = query
			? items.filter((item) =>
					searchFields(item).some((field) =>
						field?.toLowerCase().includes(query)
					)
				)
			: [...items];

		const time = (item: T) => new Date(item.createdAt).getTime();
		const name = (item: T) => searchFields(item)[0];
		const comparators: Record<SortOption, (a: T, b: T) => number> = {
			newest: (a, b) => time(b) - time(a),
			oldest: (a, b) => time(a) - time(b),
			"name-asc": (a, b) => name(a).localeCompare(name(b)),
			"name-desc": (a, b) => name(b).localeCompare(name(a)),
		};
		return result.sort(comparators[sortBy]);
	}, [items, debouncedSearch, sortBy, searchFields]);
}
