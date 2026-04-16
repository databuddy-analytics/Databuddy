"use client";

import {
	keepPreviousData,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	fetchInsightsAi,
	fetchInsightsHistoryPage,
	INSIGHT_CACHE,
	INSIGHT_QUERY_KEYS,
	type InsightsHistoryPage,
} from "@/lib/insight-api";
import { collapseInsightsBySignal } from "@/lib/insight-signal-key";
import type { Insight } from "@/lib/insight-types";
import { mapHistoryRowToInsight } from "@/lib/insight-types";

const HISTORY_PAGE_SIZE = 50;

function mergeAiWithHistoryPages(
	ai: Insight[],
	historyPages: InsightsHistoryPage[]
): Insight[] {
	const seen = new Set<string>();
	const out: Insight[] = [];

	for (const i of ai) {
		if (!seen.has(i.id)) {
			seen.add(i.id);
			out.push(i);
		}
	}

	for (const page of historyPages) {
		for (const row of page.insights) {
			const mapped = mapHistoryRowToInsight(row);
			if (!seen.has(mapped.id)) {
				seen.add(mapped.id);
				out.push(mapped);
			}
		}
	}

	return out;
}

export function useInsightsFeed() {
	const queryClient = useQueryClient();
	const {
		activeOrganization,
		activeOrganizationId,
		isLoading: isOrgContextLoading,
	} = useOrganizationsContext();

	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const historyInfinite = useInfiniteQuery({
		queryKey: [INSIGHT_QUERY_KEYS.historyInfinite, orgId],
		queryFn: ({ pageParam }) =>
			fetchInsightsHistoryPage(
				orgId ?? "",
				pageParam as number,
				HISTORY_PAGE_SIZE
			),
		initialPageParam: 0,
		getNextPageParam: (lastPage, _allPages, lastPageParam) => {
			if (!lastPage.hasMore) {
				return undefined;
			}
			return (lastPageParam as number) + HISTORY_PAGE_SIZE;
		},
		enabled: !!orgId,
		staleTime: INSIGHT_CACHE.historyStaleTime,
		gcTime: INSIGHT_CACHE.gcTime,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
		retry: 2,
		retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
	});

	const aiQuery = useQuery({
		queryKey: [INSIGHT_QUERY_KEYS.ai, orgId],
		queryFn: () => fetchInsightsAi(orgId ?? ""),
		enabled: !!orgId,
		staleTime: INSIGHT_CACHE.staleTime,
		gcTime: INSIGHT_CACHE.gcTime,
		refetchInterval: INSIGHT_CACHE.staleTime,
		refetchOnWindowFocus: false,
		placeholderData: keepPreviousData,
		retry: 2,
		retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
	});

	const mergedInsights = useMemo(() => {
		const fresh = (aiQuery.data?.insights ?? []).map(
			(i): Insight => ({
				...i,
				insightSource: "ai",
			})
		);
		const pages = historyInfinite.data?.pages ?? [];
		const merged = mergeAiWithHistoryPages(fresh, pages);
		return collapseInsightsBySignal(merged);
	}, [aiQuery.data?.insights, historyInfinite.data?.pages]);

	const refetchAll = useCallback(async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: [INSIGHT_QUERY_KEYS.historyInfinite, orgId],
			}),
			queryClient.invalidateQueries({
				queryKey: [INSIGHT_QUERY_KEYS.ai, orgId],
			}),
		]);
	}, [queryClient, orgId]);

	const isInitialLoading =
		isOrgContextLoading ||
		Boolean(
			orgId &&
				!(historyInfinite.isFetched && aiQuery.isFetched) &&
				!(historyInfinite.isError && aiQuery.isError)
		);

	const isError =
		mergedInsights.length === 0 &&
		historyInfinite.isFetched &&
		aiQuery.isFetched &&
		(historyInfinite.isError || aiQuery.isError);

	const isFetching = historyInfinite.isFetching || aiQuery.isFetching;

	const isRefreshing = isFetching && !isInitialLoading;

	const isFetchingFresh = mergedInsights.length > 0 && aiQuery.isFetching;

	return {
		insights: mergedInsights,
		source: aiQuery.data?.source ?? null,
		isLoading: isInitialLoading,
		isRefreshing,
		isFetching,
		isFetchingFresh,
		isError,
		refetch: refetchAll,
		fetchNextPage: historyInfinite.fetchNextPage,
		hasNextPage: historyInfinite.hasNextPage ?? false,
		isFetchingNextPage: historyInfinite.isFetchingNextPage,
	};
}
