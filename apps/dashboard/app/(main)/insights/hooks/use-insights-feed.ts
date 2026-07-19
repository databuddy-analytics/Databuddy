"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { insightQueries } from "@/lib/insight-api";

export function useInsightsFeed() {
	const {
		activeOrganization,
		activeOrganizationId,
		isLoading: isOrgContextLoading,
	} = useOrganizationsContext();

	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const historyInfinite = useInfiniteQuery(
		insightQueries.historyInfinite(orgId)
	);

	const insights =
		historyInfinite.data?.pages.flatMap((page) => page.insights) ?? [];

	const isInitialLoading =
		isOrgContextLoading || Boolean(orgId && historyInfinite.isLoading);
	const isError = insights.length === 0 && historyInfinite.isError;

	const isFetching = historyInfinite.isFetching;

	const isRefreshing = isFetching && !isInitialLoading;

	return {
		insights,
		isLoading: isInitialLoading,
		isRefreshing,
		isFetching,
		isError,
		refetch: historyInfinite.refetch,
		fetchNextPage: historyInfinite.fetchNextPage,
		hasNextPage: historyInfinite.hasNextPage ?? false,
		isFetchingNextPage: historyInfinite.isFetchingNextPage,
	};
}
