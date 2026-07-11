"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { insightQueries } from "@/lib/insight-api";
import { collapseInsightsBySignal } from "@/lib/insight-signal-key";

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

	const insights = useMemo(() => {
		const rows =
			historyInfinite.data?.pages.flatMap((page) => page.insights) ?? [];
		return collapseInsightsBySignal(rows);
	}, [historyInfinite.data?.pages]);

	const refetch = useCallback(async () => {
		await historyInfinite.refetch();
	}, [historyInfinite.refetch]);

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
		refetch,
		fetchNextPage: historyInfinite.fetchNextPage,
		hasNextPage: historyInfinite.hasNextPage ?? false,
		isFetchingNextPage: historyInfinite.isFetchingNextPage,
	};
}
