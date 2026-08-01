import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

const INSIGHT_CACHE = {
	gcTime: 30 * 60 * 1000,
	historyStaleTime: 5 * 60 * 1000,
} as const;

const INSIGHTS_ROOT = ["insights"] as const;
const BRIEF_PAGE_SIZE = 5;
const HISTORY_PAGE_SIZE = 50;
const RECOMMENDATIONS_PAGE_SIZE = 20;

export const insightQueries = {
	all: () => INSIGHTS_ROOT,
	briefInfinite: (orgId: string | undefined) =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "brief-infinite", orgId] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightsBriefPage(orgId ?? "", pageParam, BRIEF_PAGE_SIZE),
			initialPageParam: 0,
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.hasMore ? lastPageParam + BRIEF_PAGE_SIZE : undefined,
			enabled: !!orgId,
			staleTime: INSIGHT_CACHE.historyStaleTime,
			gcTime: INSIGHT_CACHE.gcTime,
			refetchOnWindowFocus: false,
			retry: 2,
			retryDelay: (attempt: number) => Math.min(2000 * 2 ** attempt, 15_000),
		}),
	historyInfinite: (orgId: string | undefined, status?: "open" | "resolved") =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "history-infinite", orgId, status] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightsHistoryPage(
					orgId ?? "",
					pageParam,
					HISTORY_PAGE_SIZE,
					status
				),
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
	recommendationsInfinite: (orgId: string | undefined) =>
		infiniteQueryOptions({
			queryKey: [...INSIGHTS_ROOT, "recommendations-infinite", orgId] as const,
			queryFn: ({ pageParam }) =>
				fetchInsightRecommendationsPage(
					orgId ?? "",
					pageParam,
					RECOMMENDATIONS_PAGE_SIZE
				),
			initialPageParam: 0,
			getNextPageParam: (lastPage, _allPages, lastPageParam) =>
				lastPage.hasMore
					? lastPageParam + RECOMMENDATIONS_PAGE_SIZE
					: undefined,
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

function fetchInsightsBriefPage(
	organizationId: string,
	offset: number,
	limit = 50
) {
	return orpc.insights.brief.call({ organizationId, limit, offset });
}

type InsightsBriefPage = Awaited<ReturnType<typeof fetchInsightsBriefPage>>;
export type BriefInsight = InsightsBriefPage["insights"][number];

function fetchInsightsHistoryPage(
	organizationId: string,
	offset: number,
	limit = 50,
	status?: "open" | "resolved"
) {
	return orpc.insights.history.call({
		organizationId,
		limit,
		offset,
		status,
	});
}

type InsightsHistoryPage = Awaited<ReturnType<typeof fetchInsightsHistoryPage>>;
export type Insight = InsightsHistoryPage["insights"][number];

function fetchInsightRecommendationsPage(
	organizationId: string,
	offset: number,
	limit = 50
) {
	return orpc.insights.recommendations.call({
		organizationId,
		limit,
		offset,
	});
}

type InsightRecommendationsPage = Awaited<
	ReturnType<typeof fetchInsightRecommendationsPage>
>;
export type InsightRecommendation =
	InsightRecommendationsPage["recommendations"][number];

function fetchInsightById(insightId: string) {
	return orpc.insights.getById.call({ insightId });
}

export type InsightByIdResponse = Awaited<ReturnType<typeof fetchInsightById>>;
