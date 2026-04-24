"use client";

import {
	DeviceMobileIcon,
	DeviceTabletIcon,
	MonitorIcon,
} from "@phosphor-icons/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";
import { Skeleton } from "@/components/ds/skeleton";
import { ErrorBoundary } from "@/components/error-boundary";
import { BrowserIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import {
	createGeoColumns,
	createLanguageColumns,
	createTimezoneColumns,
} from "@/components/table/rows";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatNumber } from "@/lib/formatters";
import { PercentageBadge } from "../utils/technology-helpers";
import type { FullTabProps } from "../utils/types";

interface BrowserVersion {
	pageviews: number;
	percentage?: number;
	version: string;
	visitors: number;
}

interface BrowserEntry {
	browserName: string;
	name: string;
	pageviews: number;
	percentage: number;
	versions: BrowserVersion[];
	visitors: number;
}

interface ViewportEntry {
	device_type?: string;
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

function getDeviceIcon(deviceType: string | undefined) {
	const normalized = (deviceType || "").toLowerCase();
	if (normalized === "mobile") {
		return DeviceMobileIcon;
	}
	if (normalized === "tablet") {
		return DeviceTabletIcon;
	}
	return MonitorIcon;
}

function formatDeviceType(deviceType: string | undefined) {
	if (!deviceType) {
		return "Desktop";
	}
	return deviceType.charAt(0).toUpperCase() + deviceType.slice(1).toLowerCase();
}

function ScreenOutline({ ratio }: { ratio: number }) {
	const maxW = 80;
	const maxH = 56;
	let w = maxW;
	let h = w / ratio;
	if (h > maxH) {
		h = maxH;
		w = h * ratio;
	}
	return (
		<div
			className="rounded border-2 border-border bg-muted/40"
			style={{ width: w, height: h }}
		/>
	);
}

function ScreenTileSkeleton() {
	return (
		<div className="flex flex-col gap-3 rounded border border-border/60 bg-card p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Skeleton className="size-4 rounded" />
					<Skeleton className="h-4 w-20 rounded" />
				</div>
				<Skeleton className="h-5 w-10 rounded" />
			</div>
			<Skeleton className="mx-auto h-14 w-20 rounded" />
			<Skeleton className="h-3 w-full rounded" />
		</div>
	);
}

export function WebsiteAudienceTab({
	websiteId,
	dateRange,
	isRefreshing,
	filters,
	addFilter,
}: Omit<FullTabProps, "setIsRefreshing" | "websiteData">) {
	const batchQueries = useMemo(
		() => [
			{
				id: "geographic-data",
				parameters: ["country", "region", "city", "timezone", "language"],
				limit: 100,
				filters,
			},
			{
				id: "device-data",
				parameters: [
					"browser_name",
					"browser_versions",
					"os_name",
					"screen_resolution",
				],
				limit: 50,
				filters,
			},
		],
		[filters]
	);

	const { results: batchResults, isLoading: isBatchLoading } =
		useBatchDynamicQuery(websiteId, dateRange, batchQueries);

	const geographicData = useMemo(
		() =>
			batchResults?.find((r) => r.queryId === "geographic-data")?.data || {},
		[batchResults]
	);
	const deviceData = useMemo(
		() => batchResults?.find((r) => r.queryId === "device-data")?.data || {},
		[batchResults]
	);

	const processedBrowserData = useMemo((): BrowserEntry[] => {
		const browserVersions = deviceData.browser_versions || [];
		const browserData = deviceData.browser_name || [];

		return browserData.map((browser: any) => ({
			...browser,
			browserName: browser.name,
			versions: browserVersions
				.filter((v: any) => v.browser_name === browser.name)
				.map((v: any) => ({
					version: v.browser_version,
					visitors: v.visitors,
					pageviews: v.pageviews,
					percentage: v.percentage,
				})),
		}));
	}, [deviceData.browser_name, deviceData.browser_versions]);

	const isLoading = isBatchLoading || isRefreshing;

	const browserColumns = useMemo(
		(): ColumnDef<BrowserEntry>[] => [
			{
				id: "browserName",
				accessorKey: "browserName",
				header: "Browser",
				cell: (info: CellContext<BrowserEntry, any>) => {
					const browserName = info.getValue() as string;
					const row = info.row.original;
					const versionCount = row.versions?.length || 0;
					return (
						<div className="flex items-center gap-3">
							<BrowserIcon
								fallback={
									<div className="flex size-5 items-center justify-center rounded bg-secondary font-medium text-secondary-foreground text-xs">
										{browserName.charAt(0).toUpperCase()}
									</div>
								}
								name={browserName}
								size="md"
							/>
							<div>
								<div className="font-medium text-foreground">{browserName}</div>
								<div className="text-muted-foreground text-xs">
									{versionCount} {versionCount === 1 ? "version" : "versions"}
								</div>
							</div>
						</div>
					);
				},
			},
			{
				id: "visitors",
				accessorKey: "visitors",
				header: "Visitors",
				cell: (info: CellContext<BrowserEntry, any>) => (
					<div className="font-medium tabular-nums">
						{formatNumber(info.getValue())}
					</div>
				),
			},
			{
				id: "pageviews",
				accessorKey: "pageviews",
				header: "Pageviews",
				cell: (info: CellContext<BrowserEntry, any>) => (
					<div className="font-medium tabular-nums">
						{formatNumber(info.getValue())}
					</div>
				),
			},
			{
				id: "percentage",
				accessorKey: "percentage",
				header: "Share",
				cell: (info: CellContext<BrowserEntry, any>) => (
					<PercentageBadge percentage={info.getValue() as number} />
				),
			},
		],
		[]
	);

	const displayNames = useMemo(() => {
		if (typeof window === "undefined") {
			return null;
		}
		return new Intl.DisplayNames([navigator.language || "en"], {
			type: "language",
		});
	}, []);

	const countryColumns = useMemo(
		() => createGeoColumns({ type: "country" }),
		[]
	);
	const regionColumns = useMemo(() => createGeoColumns({ type: "region" }), []);
	const cityColumns = useMemo(() => createGeoColumns({ type: "city" }), []);
	const timezoneColumns = useMemo(() => createTimezoneColumns(), []);
	const languageColumns = useMemo(
		() => createLanguageColumns(displayNames),
		[displayNames]
	);

	const geographicTabs = useMemo(
		() => [
			{
				id: "countries",
				label: "Countries",
				data: geographicData.country || [],
				columns: countryColumns,
				getFilter: (row: any) => ({
					field: "country",
					value: row.country_name || row.name,
				}),
			},
			{
				id: "regions",
				label: "Regions",
				data: geographicData.region || [],
				columns: regionColumns,
				getFilter: (row: any) => ({ field: "region", value: row.name }),
			},
			{
				id: "cities",
				label: "Cities",
				data: geographicData.city || [],
				columns: cityColumns,
				getFilter: (row: any) => ({ field: "city", value: row.name }),
			},
			...(displayNames
				? [
						{
							id: "languages",
							label: "Languages",
							data: geographicData.language || [],
							columns: languageColumns,
							getFilter: (row: any) => ({ field: "language", value: row.name }),
						},
					]
				: []),
			{
				id: "timezones",
				label: "Timezones",
				data: geographicData.timezone || [],
				columns: timezoneColumns,
				getFilter: (row: any) => ({ field: "timezone", value: row.name }),
			},
		],
		[
			geographicData.country,
			geographicData.region,
			geographicData.city,
			geographicData.language,
			geographicData.timezone,
			displayNames,
			countryColumns,
			regionColumns,
			cityColumns,
			timezoneColumns,
			languageColumns,
		]
	);

	const handleAddFilter = useCallback(
		(field: string, value: string) =>
			addFilter({ field, operator: "eq" as const, value }),
		[addFilter]
	);

	const resolutions: ViewportEntry[] = deviceData.screen_resolution || [];

	return (
		<div className="space-y-4">
			<DataTable
				columns={browserColumns}
				data={processedBrowserData}
				description="Browsers and their versions"
				expandable={true}
				getSubRows={(row: any) => row.versions}
				isLoading={isLoading}
				minHeight={400}
				onAddFilter={handleAddFilter}
				renderSubRow={(subRow: any, parentRow: any) => {
					const percentage = Math.round(
						((subRow.visitors || 0) / (parentRow.visitors || 1)) * 100
					);
					const solidEnd = Math.max(0, percentage - 4);
					const shareBarStyle =
						percentage > 0
							? {
									backgroundImage: `linear-gradient(to right, color-mix(in oklab, var(--primary) 8%, transparent) 0%, color-mix(in oklab, var(--primary) 8%, transparent) ${solidEnd}%, transparent ${percentage}%)`,
								}
							: undefined;
					return (
						<div
							className="grid grid-cols-4 items-center gap-3 bg-muted/30 px-12 py-2 text-sm"
							style={shareBarStyle}
						>
							<div className="flex items-center gap-2 text-foreground">
								<div className="size-1 rounded-full bg-muted-foreground/40" />
								<span className="font-medium">
									{subRow.version || "Unknown"}
								</span>
							</div>
							<div className="text-right font-medium text-foreground tabular-nums">
								{formatNumber(subRow.visitors)}
							</div>
							<div className="text-right font-medium text-foreground tabular-nums">
								{formatNumber(subRow.pageviews)}
							</div>
							<div className="text-right">
								<PercentageBadge percentage={percentage} />
							</div>
						</div>
					);
				}}
				tabs={[
					{
						id: "browsers",
						label: "Browsers",
						data: processedBrowserData,
						columns: browserColumns,
						getFilter: (row: any) => ({
							field: "browser_name",
							value: row.browserName || row.name,
						}),
					},
				]}
				title="Browser Versions"
			/>

			<ErrorBoundary>
				<DataTable
					description="Visitors by location, timezone, and language"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={400}
					onAddFilter={handleAddFilter}
					tabs={geographicTabs}
					title="Geographic Distribution"
				/>
			</ErrorBoundary>

			<Card>
				<Card.Header className="py-3">
					<Card.Title className="text-sm">Screen Resolutions</Card.Title>
					<Card.Description>
						Visitors by screen size and device type
					</Card.Description>
				</Card.Header>
				<Card.Content>
					{isLoading ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: 6 }).map((_, i) => (
								<ScreenTileSkeleton key={`skel-${i}`} />
							))}
						</div>
					) : resolutions.length ? (
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{resolutions.slice(0, 6).map((item) => {
									if (!item.name) {
										return null;
									}
									const [width, height] = item.name.split("x").map(Number);
									const isValid =
										Number.isFinite(width) && Number.isFinite(height);
									const Icon = getDeviceIcon(item.device_type);
									const type = formatDeviceType(item.device_type);
									const ratio = isValid && height > 0 ? width / height : 16 / 9;

									return (
										<div
											className="flex flex-col gap-3 rounded border border-border/60 bg-card p-4"
											key={`${item.name}-${item.device_type ?? "x"}-${item.visitors}`}
										>
											<div className="flex items-center justify-between gap-2">
												<div className="flex min-w-0 items-center gap-2">
													<Icon className="size-4 shrink-0 text-muted-foreground" />
													<div className="min-w-0">
														<div className="truncate font-medium text-foreground text-sm">
															{item.name}
														</div>
														<div className="text-muted-foreground text-xs">
															{type}
														</div>
													</div>
												</div>
												<PercentageBadge percentage={item.percentage || 0} />
											</div>

											<div className="flex h-14 items-center justify-center">
												<ScreenOutline ratio={ratio} />
											</div>

											<div className="flex items-center justify-between text-xs">
												<span className="font-medium text-foreground tabular-nums">
													{formatNumber(item.visitors)} visitors
												</span>
												<span className="text-muted-foreground tabular-nums">
													{formatNumber(item.pageviews ?? 0)} views
												</span>
											</div>
										</div>
									);
								})}
							</div>
							{resolutions.length > 6 && (
								<p className="text-center text-muted-foreground text-xs">
									Showing top 6 of {resolutions.length}
								</p>
							)}
						</div>
					) : (
						<EmptyState
							description="Resolution data will appear when visitors start using your site"
							icon={<MonitorIcon />}
							title="No screen resolution data"
						/>
					)}
				</Card.Content>
			</Card>
		</div>
	);
}
