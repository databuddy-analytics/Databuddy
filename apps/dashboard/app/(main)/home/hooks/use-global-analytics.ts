"use client";

import type { ProcessedMiniChartData } from "@databuddy/shared/types/website";
import { useMemo } from "react";
import type { Website } from "@/hooks/use-websites";
import { useWebsites } from "@/hooks/use-websites";

export interface GlobalAnalytics {
	totalActiveUsers: number;
	totalViews: number;
	averageTrend: number;
	trendDirection: "up" | "down" | "neutral";
	websiteCount: number;
	topPerformers: Array<{
		id: string;
		name: string | null;
		domain: string;
		views: number;
		trend: ProcessedMiniChartData["trend"];
		activeUsers: number;
	}>;
	needsSetup: Array<{
		id: string;
		name: string | null;
		domain: string;
	}>;
}

export function useGlobalAnalytics() {
	const {
		websites = [],
		chartData = {},
		activeUsers = {},
		isLoading,
		isFetching,
		isError,
		refetch,
	} = useWebsites();

	const analytics = useMemo<GlobalAnalytics>(() => {
		const sites = websites as Website[];
		const charts = chartData as Record<string, ProcessedMiniChartData>;
		const users = activeUsers as Record<string, number>;

		if (sites.length === 0) {
			return {
				totalActiveUsers: 0,
				totalViews: 0,
				averageTrend: 0,
				trendDirection: "neutral",
				websiteCount: 0,
				topPerformers: [],
				needsSetup: [],
			};
		}

		let totalActiveUsers = 0;
		let totalViews = 0;
		let trendSum = 0;
		let trendCount = 0;

		const websiteStats: GlobalAnalytics["topPerformers"] = [];
		const needsSetup: GlobalAnalytics["needsSetup"] = [];

		for (const website of sites) {
			const chart = charts[website.id];
			const active = users[website.id] ?? 0;

			totalActiveUsers += active;

			if (chart) {
				totalViews += chart.totalViews;

				if (chart.trend) {
					const trendValue =
						chart.trend.type === "down"
							? -chart.trend.value
							: chart.trend.value;
					trendSum += trendValue;
					trendCount++;
				}

				if (chart.totalViews > 0) {
					websiteStats.push({
						id: website.id,
						name: website.name,
						domain: website.domain,
						views: chart.totalViews,
						trend: chart.trend,
						activeUsers: active,
					});
				} else {
					needsSetup.push({
						id: website.id,
						name: website.name,
						domain: website.domain,
					});
				}
			} else {
				needsSetup.push({
					id: website.id,
					name: website.name,
					domain: website.domain,
				});
			}
		}

		const averageTrend = trendCount > 0 ? trendSum / trendCount : 0;
		const trendDirection: GlobalAnalytics["trendDirection"] =
			averageTrend > 1 ? "up" : averageTrend < -1 ? "down" : "neutral";

		const topPerformers = websiteStats
			.sort((a, b) => b.views - a.views)
			.slice(0, 5);

		return {
			totalActiveUsers,
			totalViews,
			averageTrend: Math.abs(averageTrend),
			trendDirection,
			websiteCount: sites.length,
			topPerformers,
			needsSetup,
		};
	}, [websites, chartData, activeUsers]);

	return {
		...analytics,
		isLoading,
		isFetching,
		isError,
		refetch,
	};
}
