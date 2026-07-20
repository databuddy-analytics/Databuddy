import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

const INSIGHT_CACHE = {
	gcTime: 30 * 60 * 1000,
	historyStaleTime: 5 * 60 * 1000,
} as const;

const INSIGHTS_ROOT = ["insights"] as const;
const HISTORY_PAGE_SIZE = 50;

export const insightQueries = {
	all: () => INSIGHTS_ROOT,
	historyInfinite: (orgId: string | undefined) =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "history-infinite", orgId] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightsHistoryPage(orgId ?? "", pageParam, HISTORY_PAGE_SIZE),
			initialPageParam: 0,
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.hasMore ? lastPageParam + HISTORY_PAGE_SIZE : undefined,
			enabled: !!orgId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 2,
			retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 15_000),
		}),
	byId: (insightId: string | undefined) =>
		queryOptions({
			queryKey: [...INSIGHTS_ROOT, "by-id", insightId] as const,
			queryFn: () => fetchInsightById(insightId ?? ""),
			enabled: !!insightId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 1,
		}),
};

function fetchInsightsHistoryPage(
	organizationId: string,
	offset: number,
	limit = 50
) {
	return orpc.insights.history.call({ organizationId, limit, offset });
}

type InsightsHistoryPage = Awaited<ReturnType<typeof fetchInsightsHistoryPage>>;
export type Insight = InsightsHistoryPage["insights"][number];

function fetchInsightById(insightId: string) {
	return orpc.insights.getById.call({ insightId });
}

export type InsightByIdResponse = Awaited<ReturnType<typeof fetchInsightById>>;
