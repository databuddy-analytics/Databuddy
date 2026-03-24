import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMemo } from "react";
import type { Link } from "@/hooks/use-links";

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";

export function useFilteredLinks(
	links: Link[],
	searchQuery: string,
	sortBy: SortOption,
): Link[] {
	const [debouncedSearch] = useDebouncedValue(searchQuery, { wait: 200 });

	return useMemo(() => {
		let result = [...links];

		if (debouncedSearch.trim()) {
			const query = debouncedSearch.toLowerCase();
			result = result.filter(
				(link) =>
					link.name.toLowerCase().includes(query) ||
					link.slug.toLowerCase().includes(query) ||
					link.targetUrl.toLowerCase().includes(query) ||
					(link.externalId?.toLowerCase().includes(query) ?? false),
			);
		}

		switch (sortBy) {
			case "newest":
				result.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				);
				break;
			case "oldest":
				result.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
				);
				break;
			case "name-asc":
				result.sort((a, b) => a.name.localeCompare(b.name));
				break;
			case "name-desc":
				result.sort((a, b) => b.name.localeCompare(a.name));
				break;
			default:
				break;
		}

		return result;
	}, [links, debouncedSearch, sortBy]);
}
