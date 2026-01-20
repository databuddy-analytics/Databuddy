"use client";

import { ArrowLeftIcon } from "@phosphor-icons/react/dist/ssr/ArrowLeft";
import { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { CopyIcon } from "@phosphor-icons/react/dist/ssr/Copy";
import { CursorClickIcon } from "@phosphor-icons/react/dist/ssr/CursorClick";
import { GlobeIcon } from "@phosphor-icons/react/dist/ssr/Globe";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr/Link";
import { MapPinIcon } from "@phosphor-icons/react/dist/ssr/MapPin";
import { UsersIcon } from "@phosphor-icons/react/dist/ssr/Users";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { toast } from "sonner";
import { DeviceTypeCell, StatCard } from "@/components/analytics";
import { ReferrerSourceCell } from "@/components/atomic/ReferrerSourceCell";
import { EmptyState } from "@/components/empty-state";
import { CountryFlag } from "@/components/icon";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { DataTable } from "@/components/table/data-table";
import { Button } from "@/components/ui/button";
import { PercentageBadge } from "@/components/ui/percentage-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useLink, useLinkStats } from "@/hooks/use-links";
import { useMediaQuery } from "@/hooks/use-media-query";
import { formatMetricNumber } from "@/lib/formatters";

const LINKS_BASE_URL = "https://dby.sh";

interface SourceEntry {
	name: string;
	clicks: number;
	percentage: number;
	referrer?: string;
	domain?: string;
}

function extractDomain(referrer: string | undefined): string | undefined {
	if (!referrer || referrer === "Direct" || referrer === "") {
		return undefined;
	}
	try {
		// If it already looks like a URL, parse it
		if (referrer.startsWith("http://") || referrer.startsWith("https://")) {
			return new URL(referrer).hostname;
		}
		// If it's just a domain or path like "t.co/" or "google.com"
		const cleaned = referrer.replace(/^\/+|\/+$/g, "");
		if (cleaned.includes(".")) {
			return cleaned.split("/")[0];
		}
		return undefined;
	} catch {
		return undefined;
	}
}

interface GeoEntry {
	name: string;
	country_code: string;
	country_name: string;
	clicks: number;
	percentage: number;
}

interface ChartDataPoint {
	date: string;
	clicks: number;
}

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
		<div className="space-y-3 sm:space-y-4">
			{/* Header skeleton */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 flex-1">
					<Skeleton className="mb-2 h-4 w-24" />
					<div className="flex items-center gap-3">
						<Skeleton className="size-9 shrink-0 rounded" />
						<div className="min-w-0">
							<Skeleton className="mb-1 h-6 w-48" />
							<div className="flex items-center gap-2">
								<Skeleton className="h-5 w-24" />
								<Skeleton className="h-4 w-48" />
							</div>
						</div>
					</div>
				</div>
				<Skeleton className="h-8 w-24" />
			</div>

			{/* Stats cards skeleton */}
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

			{/* Chart skeleton */}
			<div className="rounded border bg-sidebar">
				<div className="border-b px-3 py-3 sm:px-4">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="mt-1 h-3 w-48" />
				</div>
				<div className="p-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>

			{/* Tables skeleton */}
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

function ClicksChart({
	data,
	height = 350,
	isHourly = false,
}: {
	data: ChartDataPoint[];
	height?: number;
	isHourly?: boolean;
}) {
	if (data.length === 0) {
		return (
			<div
				className="flex items-center justify-center"
				style={{ height: `${height}px` }}
			>
				<div className="flex flex-col items-center py-12 text-center">
					<div className="relative flex size-12 items-center justify-center rounded bg-accent">
						<ChartLineIcon
							className="size-6 text-foreground"
							weight="duotone"
						/>
					</div>
					<p className="mt-6 font-medium text-foreground text-lg">
						No click data available
					</p>
					<p className="mx-auto max-w-sm text-muted-foreground text-sm">
						Click data will appear here as visitors interact with your link
					</p>
				</div>
			</div>
		);
	}

	const xAxisFormat = isHourly ? "MMM D, HH:mm" : "MMM D";
	const tooltipFormat = isHourly ? "MMM D, YYYY HH:mm" : "MMM D, YYYY";

	return (
		<div style={{ height: `${height}px`, width: "100%" }}>
			<ResponsiveContainer height="100%" width="100%">
				<AreaChart
					data={data}
					margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
				>
					<defs>
						<linearGradient id="clicksGradient" x1="0" x2="0" y1="0" y2="1">
							<stop
								offset="0%"
								stopColor="var(--color-primary)"
								stopOpacity={0.3}
							/>
							<stop
								offset="100%"
								stopColor="var(--color-primary)"
								stopOpacity={0.02}
							/>
						</linearGradient>
					</defs>
					<CartesianGrid
						stroke="var(--sidebar-border)"
						strokeDasharray="2 4"
						strokeOpacity={0.3}
						vertical={false}
					/>
					<XAxis
						axisLine={false}
						dataKey="date"
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickFormatter={(value) => dayjs(value).format(xAxisFormat)}
						tickLine={false}
					/>
					<YAxis
						allowDecimals={false}
						axisLine={false}
						tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={45}
					/>
					<Tooltip
						content={({ active, payload, label }) =>
							active && payload?.[0] && typeof payload[0].value === "number" ? (
								<div className="min-w-[160px] rounded border bg-popover p-3 shadow-lg">
									<div className="mb-2 flex items-center gap-2 border-b pb-2">
										<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
										<p className="font-medium text-foreground text-xs">
											{dayjs(label).format(tooltipFormat)}
										</p>
									</div>
									<div className="flex items-center justify-between gap-3">
										<div className="flex items-center gap-2">
											<div
												className="size-2.5 rounded-full"
												style={{ backgroundColor: "var(--color-primary)" }}
											/>
											<span className="text-muted-foreground text-xs">
												Clicks
											</span>
										</div>
										<span className="font-semibold text-foreground text-sm tabular-nums">
											{formatMetricNumber(payload[0].value)}
										</span>
									</div>
								</div>
							) : null
						}
						cursor={{
							stroke: "var(--color-primary)",
							strokeDasharray: "4 4",
							strokeOpacity: 0.5,
						}}
					/>
					<Area
						activeDot={{
							r: 4,
							fill: "var(--color-primary)",
							stroke: "var(--color-background)",
							strokeWidth: 2,
						}}
						dataKey="clicks"
						dot={false}
						fill="url(#clicksGradient)"
						stroke="var(--color-primary)"
						strokeWidth={2.5}
						type="monotone"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}

function createReferrerColumns(): ColumnDef<SourceEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Source",
			cell: ({ row }: CellContext<SourceEntry, unknown>) => {
				const entry = row.original;
				const domain =
					entry.domain || extractDomain(entry.referrer || entry.name);
				return (
					<ReferrerSourceCell
						domain={domain}
						name={entry.name}
						referrer={entry.referrer}
					/>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => (
				<span className="font-medium text-foreground tabular-nums">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

function createGeoColumns(
	type: "country" | "region" | "city"
): ColumnDef<GeoEntry>[] {
	return [
		{
			id: type,
			accessorKey: type === "country" ? "country_name" : "name",
			header: type.charAt(0).toUpperCase() + type.slice(1),
			cell: (info: CellContext<GeoEntry, unknown>) => {
				const entry = info.row.original;
				const name = (info.getValue() as string) || "";
				const countryCode = entry.country_code;
				const countryName = entry.country_name;

				const getIcon = () => {
					if (countryCode && countryCode !== "Unknown" && countryCode !== "") {
						return <CountryFlag country={countryCode} size={16} />;
					}
					if (type === "country" && name && name !== "Unknown") {
						return <CountryFlag country={name} size={16} />;
					}
					return (
						<MapPinIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					);
				};

				const formatName = () => {
					if (type === "country") {
						return name || "Unknown";
					}
					if (countryName && name) {
						return `${name}, ${countryName}`;
					}
					return name || `Unknown ${type}`;
				};

				return (
					<div className="flex items-center gap-2">
						{getIcon()}
						<span className="font-medium">{formatName()}</span>
					</div>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: (info: CellContext<GeoEntry, unknown>) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: (info: CellContext<GeoEntry, unknown>) => {
				const percentage = info.getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

function createDeviceColumns(): ColumnDef<SourceEntry>[] {
	return [
		{
			id: "name",
			accessorKey: "name",
			header: "Device",
			cell: ({ row }: CellContext<SourceEntry, unknown>) => {
				const entry = row.original;
				return (
					<DeviceTypeCell
						device_type={entry.name?.toLowerCase() || "unknown"}
					/>
				);
			},
		},
		{
			id: "clicks",
			accessorKey: "clicks",
			header: "Clicks",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => (
				<span className="font-medium tabular-nums">
					{formatNumber(getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: ({ getValue }: CellContext<SourceEntry, unknown>) => {
				const percentage = getValue() as number;
				return <PercentageBadge percentage={percentage} />;
			},
		},
	];
}

export function LinkStatsContent() {
	const params = useParams();
	const linkId = params.id as string;
	const { activeOrganization } = useOrganizationsContext();
	const { dateRange, currentGranularity } = useDateFilters();

	const isMobile = useMediaQuery("(max-width: 640px)");
	const isHourly = currentGranularity === "hourly";

	const { data: link, isLoading: isLoadingLink } = useLink(
		linkId,
		activeOrganization?.id ?? ""
	);

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
		() =>
			chartData.map((day) => ({
				date: day.date,
				value: day.clicks,
			})),
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

	const referrerData = useMemo<SourceEntry[]>(() => {
		return stats?.topReferrers ?? [];
	}, [stats?.topReferrers]);

	const countryData = useMemo<GeoEntry[]>(() => {
		return stats?.topCountries ?? [];
	}, [stats?.topCountries]);

	const regionData = useMemo<GeoEntry[]>(() => {
		return stats?.topRegions ?? [];
	}, [stats?.topRegions]);

	const cityData = useMemo<GeoEntry[]>(() => {
		return stats?.topCities ?? [];
	}, [stats?.topCities]);

	const deviceData = useMemo<SourceEntry[]>(() => {
		return stats?.topDevices ?? [];
	}, [stats?.topDevices]);

	const referrerColumns = useMemo(() => createReferrerColumns(), []);
	const countryColumns = useMemo(() => createGeoColumns("country"), []);
	const regionColumns = useMemo(() => createGeoColumns("region"), []);
	const cityColumns = useMemo(() => createGeoColumns("city"), []);
	const deviceColumns = useMemo(() => createDeviceColumns(), []);

	const sourceTabs = useMemo(
		() => [
			{
				id: "referrers",
				label: "Referrers",
				data: referrerData,
				columns: referrerColumns,
			},
			{
				id: "devices",
				label: "Devices",
				data: deviceData,
				columns: deviceColumns,
			},
		],
		[referrerData, referrerColumns, deviceData, deviceColumns]
	);

	const geoTabs = useMemo(
		() => [
			{
				id: "countries",
				label: "Countries",
				data: countryData,
				columns: countryColumns,
			},
			{
				id: "regions",
				label: "Regions",
				data: regionData,
				columns: regionColumns,
			},
			{
				id: "cities",
				label: "Cities",
				data: cityData,
				columns: cityColumns,
			},
		],
		[
			countryData,
			regionData,
			cityData,
			countryColumns,
			regionColumns,
			cityColumns,
		]
	);

	const handleCopy = useCallback(async () => {
		if (!link) {
			return;
		}
		try {
			await navigator.clipboard.writeText(`${LINKS_BASE_URL}/${link.slug}`);
			toast.success("Link copied to clipboard");
		} catch {
			toast.error("Failed to copy link");
		}
	}, [link]);

	if (isLoading) {
		return <StatsLoadingSkeleton />;
	}

	if (!link) {
		return (
			<div className="flex h-full items-center justify-center p-6">
				<EmptyState
					action={{
						label: "Back to Links",
						onClick: () => {
							window.location.href = "/links";
						},
					}}
					description="The link you're looking for doesn't exist or has been deleted."
					icon={<LinkIcon />}
					title="Link not found"
					variant="error"
				/>
			</div>
		);
	}

	const shortUrl = `${LINKS_BASE_URL.replace("https://", "")}/${link.slug}`;

	return (
		<div className="space-y-3 sm:space-y-4">
			{/* Header */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div className="min-w-0 flex-1">
					<Link
						className="mb-2 inline-flex items-center gap-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
						href="/links"
					>
						<ArrowLeftIcon className="size-4" weight="fill" />
						Back to Links
					</Link>
					<div className="flex items-center gap-3">
						<div className="shrink-0 rounded bg-accent p-2">
							<LinkIcon className="size-5 text-primary" weight="duotone" />
						</div>
						<div className="min-w-0">
							<h1 className="text-balance font-semibold text-foreground text-lg sm:text-xl">
								{link.name}
							</h1>
							<div className="flex items-center gap-2">
								<button
									className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs transition-colors hover:bg-muted/80"
									onClick={handleCopy}
									type="button"
								>
									<span className="text-foreground">{shortUrl}</span>
									<CopyIcon
										className="size-3 text-muted-foreground"
										weight="duotone"
									/>
								</button>
								<span className="text-muted-foreground text-xs">→</span>
								<span className="max-w-xs truncate text-muted-foreground text-xs">
									{link.targetUrl}
								</span>
							</div>
						</div>
					</div>
				</div>
				<Button asChild size="sm" variant="outline">
					<a href={link.targetUrl} rel="noopener noreferrer" target="_blank">
						Visit Target
					</a>
				</Button>
			</div>

			{/* Stats Cards */}
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

			{/* Clicks Over Time Chart */}
			<div className="overflow-hidden rounded border bg-card">
				<ClicksChart
					data={chartData}
					height={isMobile ? 280 : 380}
					isHourly={isHourly}
				/>
			</div>

			{/* Data Tables */}
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
