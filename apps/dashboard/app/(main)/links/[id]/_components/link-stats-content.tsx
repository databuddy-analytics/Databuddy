"use client";

import { useParams } from "next/navigation";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics";
import { ResourceUnavailableState } from "@/components/resource-unavailable-state";
import { DataTable } from "@/components/table/data-table";
import { createReferrerColumns as createReferrerSourceColumns } from "@/components/table/rows/referrer-row";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useLink, useLinkStats } from "@/hooks/use-links";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatNumber } from "@/lib/formatters";
import { type ChartDataPoint, ClicksChart } from "./clicks-chart";
import {
	createDeviceColumns,
	createGeoColumns,
	type GeoEntry,
	type SourceEntry,
} from "./link-stats-columns";
import { CursorClickIcon, GlobeIcon, UsersIcon } from "@databuddy/ui/icons";
import { dayjs } from "@databuddy/ui";

interface MiniChartDataPoint {
	date: string;
	value: number;
}

export function LinkStatsContent() {
	const params = useParams();
	const linkId = params.id as string;
	const { dateRange, currentGranularity } = useDateFilters();

	const isMobile = useMediaQuery("(max-width: 640px)");
	const isHourly = currentGranularity === "hourly";

	const { data: link, isLoading: isLoadingLink } = useLink(linkId);

	const { data: stats, isLoading: isLoadingStats } = useLinkStats(
		linkId,
		dateRange
	);

	const isLoading = isLoadingLink || isLoadingStats;

	const chartData = useMemo<ChartDataPoint[]>(() => {
		if (!stats?.clicksByDay) {
			return [];
		}
		return stats.clicksByDay.map((day) => ({
			date: day.date,
			clicks: day.clicks,
		}));
	}, [stats?.clicksByDay]);

	const clicksChartData = useMemo<MiniChartDataPoint[]>(
		() => chartData.map((day) => ({ date: day.date, value: day.clicks })),
		[chartData]
	);

	const referrersChartData = useMemo<MiniChartDataPoint[]>(
		() => stats?.referrersByDay ?? [],
		[stats?.referrersByDay]
	);

	const countriesChartData = useMemo<MiniChartDataPoint[]>(
		() => stats?.countriesByDay ?? [],
		[stats?.countriesByDay]
	);

	const todayClicks = useMemo(() => {
		const today = dayjs().format("YYYY-MM-DD");
		const todayData = chartData.find(
			(day) => dayjs(day.date).format("YYYY-MM-DD") === today
		);
		return todayData?.clicks ?? 0;
	}, [chartData]);

	const referrerColumns = useMemo(
		() =>
			createReferrerSourceColumns<SourceEntry>({
				metrics: [{ id: "clicks", header: "Clicks" }],
			}),
		[]
	);
	const countryColumns = useMemo(() => createGeoColumns("country"), []);
	const regionColumns = useMemo(() => createGeoColumns("region"), []);
	const cityColumns = useMemo(() => createGeoColumns("city"), []);
	const deviceColumns = useMemo(() => createDeviceColumns(), []);

	const sourceTabs = useMemo(
		() => [
			{
				id: "referrers",
				label: "Referrers",
				data: (stats?.topReferrers ?? []) as SourceEntry[],
				columns: referrerColumns,
			},
			{
				id: "devices",
				label: "Devices",
				data: (stats?.topDevices ?? []) as SourceEntry[],
				columns: deviceColumns,
			},
		],
		[stats?.topReferrers, stats?.topDevices, referrerColumns, deviceColumns]
	);

	const geoTabs = useMemo(
		() => [
			{
				id: "countries",
				label: "Countries",
				data: (stats?.topCountries ?? []) as GeoEntry[],
				columns: countryColumns,
			},
			{
				id: "regions",
				label: "Regions",
				data: (stats?.topRegions ?? []) as GeoEntry[],
				columns: regionColumns,
			},
			{
				id: "cities",
				label: "Cities",
				data: (stats?.topCities ?? []) as GeoEntry[],
				columns: cityColumns,
			},
		],
		[
			stats?.topCountries,
			stats?.topRegions,
			stats?.topCities,
			countryColumns,
			regionColumns,
			cityColumns,
		]
	);

	if (!(isLoading || link)) {
		return (
			<ResourceUnavailableState
				backHref="/links"
				backLabel="Back to Links"
				className="h-full p-6"
			/>
		);
	}

	return (
		<div className="p-4">
			<div className="space-y-3 sm:space-y-4">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
					<StatCard
						chartData={isLoading ? undefined : clicksChartData}
						chartStepType="monotone"
						chartType="area"
						description={`${formatNumber(todayClicks)} today`}
						icon={CursorClickIcon}
						id="clicks-chart"
						isLoading={isLoading}
						showChart={true}
						title="Total Clicks"
						value={formatNumber(stats?.totalClicks ?? 0)}
					/>
					<StatCard
						chartData={isLoading ? undefined : referrersChartData}
						chartStepType="monotone"
						chartType="area"
						description="Unique traffic sources"
						icon={UsersIcon}
						id="referrers-count"
						isLoading={isLoading}
						showChart={true}
						title="Referrers"
						value={stats?.topReferrers?.length ?? 0}
					/>
					<StatCard
						chartData={isLoading ? undefined : countriesChartData}
						chartStepType="monotone"
						chartType="area"
						description="Geographic reach"
						icon={GlobeIcon}
						id="countries-count"
						isLoading={isLoading}
						showChart={true}
						title="Countries"
						value={stats?.topCountries?.length ?? 0}
					/>
				</div>

				<ClicksChart
					data={chartData}
					height={isMobile ? 280 : 380}
					isHourly={isHourly}
					isLoading={isLoading}
				/>

				<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
					<DataTable
						description="Where your clicks come from"
						initialPageSize={8}
						isLoading={isLoading}
						minHeight={350}
						tabs={sourceTabs}
						title="Traffic Sources"
					/>
					<DataTable
						description="Geographic distribution"
						initialPageSize={8}
						isLoading={isLoading}
						minHeight={350}
						tabs={geoTabs}
						title="Geographic Distribution"
					/>
				</div>
			</div>
		</div>
	);
}
