import { useDebouncedValue } from "@tanstack/react-pacer";
import { useMemo } from "react";
import type { Monitor } from "./types";

export type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";
export type StatusFilter = "all" | "active" | "paused";

export function useFilteredMonitors(
	monitors: Monitor[],
	searchQuery: string,
	sortBy: SortOption,
	statusFilter: StatusFilter = "all"
): Monitor[] {
	const [debouncedSearch] = useDebouncedValue(searchQuery, { wait: 200 });

	return useMemo(() => {
		let result = [...monitors];

		if (statusFilter === "active") {
			result = result.filter((m) => !m.isPaused);
		} else if (statusFilter === "paused") {
			result = result.filter((m) => m.isPaused);
		}

		if (debouncedSearch.trim()) {
			const query = debouncedSearch.toLowerCase();
			result = result.filter(
				(m) =>
					(m.name?.toLowerCase().includes(query) ?? false) ||
					(m.url?.toLowerCase().includes(query) ?? false) ||
					(m.website?.name?.toLowerCase().includes(query) ?? false) ||
					(m.website?.domain?.toLowerCase().includes(query) ?? false)
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
				result.sort((a, b) => {
					const nameA = a.name || a.url || "";
					const nameB = b.name || b.url || "";
					return nameA.localeCompare(nameB);
				});
				break;
			case "name-desc":
				result.sort((a, b) => {
					const nameA = a.name || a.url || "";
					const nameB = b.name || b.url || "";
					return nameB.localeCompare(nameA);
				});
				break;
			default:
				break;
		}

		return result;
	}, [monitors, debouncedSearch, sortBy, statusFilter]);
}
