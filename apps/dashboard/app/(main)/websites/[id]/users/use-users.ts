import type { DateRange, ProfileData } from "@databuddy/shared/types/analytics";
import type {
	DynamicQueryFilter,
	DynamicQueryResponse,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";

export interface ProfileSort {
	field: string;
	order: "asc" | "desc";
}

export function useProfilesData(
	websiteId: string,
	dateRange: DateRange,
	limit = 50,
	page = 1,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>,
	sort?: ProfileSort
) {
	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "profiles-list",
			parameters: ["profile_list"],
			limit,
			page,
			filters,
			sortBy: sort?.field,
			sortOrder: sort?.order,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
		}
	);

	const profiles = useMemo(() => {
		const rows: ProfileData[] =
			(queryResult.data as any)?.profile_list ?? [];
		const seen = new Set<string>();
		return rows.filter((p) => {
			if (!p.visitor_id || seen.has(p.visitor_id)) return false;
			seen.add(p.visitor_id);
			return true;
		});
	}, [queryResult.data]);

	return {
		...queryResult,
		profiles,
		pagination: {
			page,
			limit,
			hasNext: profiles.length === limit,
			hasPrev: page > 1,
		},
	};
}
