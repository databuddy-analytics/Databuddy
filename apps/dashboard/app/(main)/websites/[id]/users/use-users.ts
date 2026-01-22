import type { DateRange, ProfileData } from"@databuddy/shared/types/analytics";
import type {
	DynamicQueryFilter,
	DynamicQueryResponse,
} from"@databuddy/shared/types/api";
import type { UseQueryOptions } from"@tanstack/react-query";
import { useMemo } from"react";
import { useDynamicQuery } from"@/hooks/use-dynamic-query";

function dedupeProfiles(profiles: ProfileData[]): ProfileData[] {
	const seen = new Set<string>();
	return profiles.filter((p) => {
		if (seen.has(p.visitor_id)) {
			return false;
		}
		seen.add(p.visitor_id);
		return true;
	});
}

export function useProfilesData(
	websiteId: string,
	dateRange: DateRange,
	limit = 50,
	page = 1,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id:"profiles-list",
			parameters: ["profile_list"],
			limit,
			page,
			filters,
		},
		{
			...options,
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
		}
	);

	const profiles = useMemo(() => {
		const rawProfiles = (queryResult.data as any)?.profile_list || [];
		return dedupeProfiles(rawProfiles);
	}, [queryResult.data]);

	const hasNextPage = useMemo(
		() => profiles.length === limit,
		[profiles.length, limit]
	);

	const hasPrevPage = useMemo(() => page > 1, [page]);

	return {
		...queryResult,
		profiles,
		pagination: {
			page,
			limit,
			hasNext: hasNextPage,
			hasPrev: hasPrevPage,
		},
	};
}
