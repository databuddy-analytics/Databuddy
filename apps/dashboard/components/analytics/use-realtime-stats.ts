import type { DynamicQueryResponse } from "@/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";

export function useRealTimeStats(
	websiteId: string,
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const dateRange = useMemo(() => {
		const now = new Date();
		const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
		return {
			start_date: fiveMinutesAgo.toISOString(),
			end_date: now.toISOString(),
		};
	}, []);

	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "realtime-active-stats",
			parameters: ["active_stats"],
		},
		{
			...options,
			refetchInterval: 5000,
			staleTime: 0,
			gcTime: 10_000,
			refetchOnWindowFocus: true,
			refetchOnMount: true,
		}
	);

	const activeUsers = useMemo(() => {
		const data = (queryResult.data as any)?.active_stats?.[0];
		return data?.active_users || 0;
	}, [queryResult.data]);

	return { ...queryResult, activeUsers };
}
