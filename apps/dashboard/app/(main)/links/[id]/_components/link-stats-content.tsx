"use client";

import { CursorClickIcon } from "@phosphor-icons/react/dist/ssr/CursorClick";
import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics";
import { EmptyState } from "@/components/empty-state";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { DataTable } from "@/components/table/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useLink, useLinkStats } from "@/hooks/use-links";
import { useMediaQuery } from "@/hooks/use-media-query";
import dayjs from "@/lib/dayjs";
import { formatMetricNumber } from "@/lib/formatters";
import { type ChartDataPoint, ClicksChart } from "./clicks-chart";
import {
	createDeviceColumns,
	createGeoColumns,
	createReferrerColumns,
	type GeoEntry,
	type SourceEntry,
} from "./link-stats-columns";

interface MiniChartDataPoint {
	date: string;
	value: number;
}

function formatNumber(value: number): string {
	if (value == null || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function StatsLoadingSkeleton() {
	return (
		<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
				{[1, 2, 3].map((i) => (
					<div
						className="overflow-hidden rounded border bg-card"
						key={`stat-skeleton-${i}`}
					>
						<div className="dotted-bg bg-accent pt-0">
							<Skeleton className="h-26 w-full" />
						</div>
						<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
							<Skeleton className="size-7 shrink-0 rounded" />
							<div className="min-w-0 flex-1 space-y-0.5">
								<Skeleton className="h-5 w-14" />
								<Skeleton className="h-3 w-12" />
							</div>
							<Skeleton className="h-3.5 w-10 shrink-0" />
						</div>
					</div>
				))}
			</div>

			<div className="rounded border bg-sidebar">
				<div className="border-b px-3 py-3 sm:px-4">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="mt-1 h-3 w-48" />
				</div>
				<div className="p-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
				{[1, 2].map((i) => (
					<div className="rounded border bg-card" key={`table-skeleton-${i}`}>
						<div className="p-3">
							<Skeleton className="h-5 w-32" />
							<Skeleton className="mt-1 h-3 w-48" />
						</div>
						<div className="space-y-2 px-3 pb-3">
							{[1, 2, 3, 4, 5].map((j) => (
								<Skeleton
									className="h-12 w-full rounded"
									key={`row-skeleton-${i}-${j}`}
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

export function LinkStatsContent() {
	const params = useParams();
	const router = useRouter();
	const linkId = params.id as string;
	const { activeOrganization } = useOrganizationsContext();
	const { dateRange, currentGranularity } = useDateFilters();

	const isMobile = useMediaQuery("(max-width: 640px)");
	const isHourly = currentGranularity === "hourly";

	const { data: link, isLoading: isLoadingLink } = useLink(
		linkId,
		activeOrganization?.id ?? "",
	);

	const { data: stats, isLoading: isLoadingStats } = useLinkStats(
		linkId,
		dateRange,
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
		[chartData],
	);

	const referrersChartData = useMemo<MiniChartDataPoint[]>(
		() => stats?.referrersByDay ?? [],
		[stats?.referrersByDay],
	);

	const countriesChartData = useMemo<MiniChartDataPoint[]>(
		() => stats?.countriesByDay ?? [],
		[stats?.countriesByDay],
	);

	const todayClicks = useMemo(() => {
		const today = dayjs().format("YYYY-MM-DD");
		const todayData = chartData.find(
			(day) => dayjs(day.date).format("YYYY-MM-DD") === today,
		);
		return todayData?.clicks ?? 0;
	}, [chartData]);

	const referrerData = useMemo<SourceEntry[]>(
		() => stats?.topReferrers ?? [],
		[stats?.topReferrers],
	);
	const countryData = useMemo<GeoEntry[]>(
		() => stats?.topCountries ?? [],
		[stats?.topCountries],
	);
	const regionData = useMemo<GeoEntry[]>(
		() => stats?.topRegions ?? [],
		[stats?.topRegions],
	);
	const cityData = useMemo<GeoEntry[]>(
		() => stats?.topCities ?? [],
		[stats?.topCities],
	);
	const deviceData = useMemo<SourceEntry[]>(
		() => stats?.topDevices ?? [],
		[stats?.topDevices],
	);

	const referrerColumns = useMemo(() => createReferrerColumns(), []);
	const countryColumns = useMemo(() => createGeoColumns("country"), []);
	const regionColumns = useMemo(() => createGeoColumns("region"), []);
	const cityColumns = useMemo(() => createGeoColumns("city"), []);
	const deviceColumns = useMemo(() => createDeviceColumns(), []);

	const sourceTabs = useMemo(
		() => [
			{ id: "referrers", label: "Referrers", data: referrerData, columns: referrerColumns },
			{ id: "devices", label: "Devices", data: deviceData, columns: deviceColumns },
		],
		[referrerData, referrerColumns, deviceData, deviceColumns],
	);

	const geoTabs = useMemo(
		() => [
			{ id: "countries", label: "Countries", data: countryData, columns: countryColumns },
			{ id: "regions", label: "Regions", data: regionData, columns: regionColumns },
			{ id: "cities", label: "Cities", data: cityData, columns: cityColumns },
		],
		[countryData, regionData, cityData, countryColumns, regionColumns, cityColumns],
	);

	if (isLoading) {
		return <StatsLoadingSkeleton />;
	}

	if (!link) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<EmptyState
					action={{
						label: "Back to Links",
						onClick: () => router.push("/links"),
					}}
					description="The link you're looking for doesn't exist or has been deleted."
					icon={<LinkIcon />}
					title="Link not found"
					variant="error"
				/>
			</div>
		);
	}

	return (
		<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
				<StatCard
					chartData={clicksChartData}
					chartStepType="monotone"
					chartType="area"
					description={`${formatNumber(todayClicks)} today`}
					icon={CursorClickIcon}
					id="clicks-chart"
					isLoading={isLoading}
					showChart={true}
					title="Total Clicks"
					value={formatMetricNumber(stats?.totalClicks ?? 0)}
				/>
				<StatCard
					chartData={referrersChartData}
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
					chartData={countriesChartData}
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

			<div className="overflow-hidden rounded border bg-card">
				<ClicksChart
					data={chartData}
					height={isMobile ? 280 : 380}
					isHourly={isHourly}
				/>
			</div>

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
	);
}
