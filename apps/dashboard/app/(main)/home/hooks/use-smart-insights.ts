"use client";

import { useMemo } from "react";
import { useInsightsFeed } from "@/app/(main)/insights/hooks/use-insights-feed";

const INSIGHTS_MAX = 20;

export function useSmartInsights() {
	const feed = useInsightsFeed();
	const insights = useMemo(
		() => feed.insights.slice(0, INSIGHTS_MAX),
		[feed.insights]
	);
	return {
		insights,
		source: feed.source,
		isLoading: feed.isLoading,
		isRefreshing: feed.isRefreshing,
		isFetching: feed.isFetching,
		isFetchingFresh: feed.isFetchingFresh,
		isError: feed.isError,
		refetch: feed.refetch,
	};
}
