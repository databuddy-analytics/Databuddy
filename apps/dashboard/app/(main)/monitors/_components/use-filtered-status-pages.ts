import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMemo } from "react";
import type { StatusPage } from "@/components/status-pages/status-page-row";

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";
export type StatusFilter = "all" | "active" | "empty";

export function useFilteredStatusPages(
	pages: StatusPage[],
	searchQuery: string,
	sortBy: SortOption,
	statusFilter: StatusFilter = "all"
): StatusPage[] {
	const [debouncedSearch] = useDebouncedValue(searchQuery, { wait: 200 });

	return useMemo(() => {
		let result = [...pages];

		if (statusFilter === "active") {
			result = result.filter((p) => p.monitorCount > 0);
		} else if (statusFilter === "empty") {
			result = result.filter((p) => p.monitorCount === 0);
		}

		if (debouncedSearch.trim()) {
			const query = debouncedSearch.toLowerCase();
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes(query) ||
					p.slug.toLowerCase().includes(query) ||
					(p.description?.toLowerCase().includes(query) ?? false)
			);
		}

		switch (sortBy) {
			case "newest":
				result.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
				);
				break;
			case "oldest":
				result.sort(
					(a, b) =>
						new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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
	}, [pages, debouncedSearch, sortBy, statusFilter]);
}
