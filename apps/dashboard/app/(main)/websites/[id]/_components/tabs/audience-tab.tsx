"use client";

import { DeviceMobileIcon } from "@phosphor-icons/react";
import { DeviceTabletIcon } from "@phosphor-icons/react";
import { LaptopIcon } from "@phosphor-icons/react";
import { MonitorIcon } from "@phosphor-icons/react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { formatNumber } from "@/lib/formatters";
import { BrowserIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import {
	createGeoColumns,
	createLanguageColumns,
	createTimezoneColumns,
} from "@/components/table/rows";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
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

interface ScreenResolutionEntry {
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

const getGradientConfig = (percentage: number) => {
	if (percentage >= 40) {
		return {
			bg: "linear-gradient(90deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.06) 100%)",
			border: "rgba(34, 197, 94, 0.2)",
		};
	}
	if (percentage >= 25) {
		return {
			bg: "linear-gradient(90deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.06) 100%)",
			border: "rgba(59, 130, 246, 0.2)",
		};
	}
	if (percentage >= 10) {
		return {
			bg: "linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.06) 100%)",
			border: "rgba(245, 158, 11, 0.2)",
		};
	}
	return {
		bg: "linear-gradient(90deg, rgba(107, 114, 128, 0.08) 0%, rgba(107, 114, 128, 0.04) 100%)",
		border: "rgba(107, 114, 128, 0.15)",
	};
};

const getDeviceInfo = (width: number, height: number, isValid: boolean) => {
	if (!isValid) {
		return {
			type: "Unknown",
			Icon: MonitorIcon,
			isMobile: false,
			isTablet: false,
		};
	}
	const longSide = Math.max(width, height);
	const shortSide = Math.min(width, height);
	const aspect = longSide / shortSide;

	if (shortSide <= 480) {
		return {
			type: "Mobile",
			Icon: DeviceMobileIcon,
			isMobile: true,
			isTablet: false,
		};
	}
	if (aspect >= 1.5 && longSide >= 1100) {
		return {
			type: longSide > 1920 ? "Desktop" : "Laptop",
			Icon: longSide > 1920 ? MonitorIcon : LaptopIcon,
			isMobile: false,
			isTablet: false,
		};
	}
	if (shortSide <= 1024 && aspect < 1.5) {
		return {
			type: "Tablet",
			Icon: DeviceTabletIcon,
			isMobile: false,
			isTablet: true,
		};
	}
	if (longSide <= 1920) {
		return {
			type: "Laptop",
			Icon: LaptopIcon,
			isMobile: false,
			isTablet: false,
		};
	}
	return {
		type: "Desktop",
		Icon: MonitorIcon,
		isMobile: false,
		isTablet: false,
	};
};

const getDisplayDimensions = (
	width: number,
	height: number,
	isValid: boolean,
	isMobile: boolean,
	isTablet: boolean
) => {
	if (isMobile) {
		return { width: 36, height: 72 };
	}
	if (isTablet) {
		return { width: 56, height: 72 };
	}

	const aspectRatio = isValid ? width / height : 16 / 9;
	const maxW = 120;
	const maxH = 72;
	let displayWidth = maxW;
	let displayHeight = displayWidth / aspectRatio;

	if (displayHeight > maxH) {
		displayHeight = maxH;
		displayWidth = displayHeight * aspectRatio;
	}

	return { width: displayWidth, height: displayHeight };
};

function MobileScreen({ width, height }: { width: number; height: number }) {
	return (
		<div
			className="relative overflow-hidden rounded-lg border-2 border-border bg-accent shadow-sm"
			style={{ width: `${width}px`, height: `${height}px` }}
		>
			<div className="absolute top-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-border" />
			<div className="absolute inset-1 top-3 overflow-hidden rounded bg-background/80">
				<div className="space-y-1 p-1">
					<div className="h-0.5 w-3/4 rounded-full bg-muted-foreground/15" />
					<div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/10" />
					<div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/10" />
				</div>
			</div>
			<div className="absolute bottom-1 left-1/2 h-0.5 w-4 -translate-x-1/2 rounded-full bg-border" />
		</div>
	);
}

function TabletScreen({ width, height }: { width: number; height: number }) {
	return (
		<div
			className="relative overflow-hidden rounded-lg border-2 border-border bg-accent shadow-sm"
			style={{ width: `${width}px`, height: `${height}px` }}
		>
			<div className="absolute top-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-border" />
			<div className="absolute inset-1.5 top-3 overflow-hidden rounded bg-background/80">
				<div className="space-y-1 p-1.5">
					<div className="h-1 w-3/4 rounded-full bg-muted-foreground/15" />
					<div className="h-1 w-1/2 rounded-full bg-muted-foreground/10" />
					<div className="h-1 w-2/3 rounded-full bg-muted-foreground/10" />
				</div>
			</div>
		</div>
	);
}

function DesktopScreen({ width, height }: { width: number; height: number }) {
	return (
		<>
			<div
				className="relative overflow-hidden rounded border-2 border-border bg-accent shadow-sm"
				style={{ width: `${width}px`, height: `${height}px` }}
			>
				<div className="absolute inset-1 overflow-hidden rounded-sm bg-background/80">
					<div className="flex h-2 items-center gap-0.5 border-border border-b bg-accent/50 px-1">
						<div className="size-0.5 rounded-full bg-red-400/60" />
						<div className="size-0.5 rounded-full bg-yellow-400/60" />
						<div className="size-0.5 rounded-full bg-green-400/60" />
					</div>
					<div className="space-y-1 p-1">
						<div className="h-0.5 w-3/4 rounded-full bg-muted-foreground/15" />
						<div className="h-0.5 w-1/2 rounded-full bg-muted-foreground/10" />
						<div className="h-0.5 w-2/3 rounded-full bg-muted-foreground/10" />
					</div>
				</div>
			</div>
			<div className="h-1.5 w-2 bg-border" />
			<div className="h-1 w-6 rounded-b bg-border/80" />
		</>
	);
}

function ScreenVisualization({
	isMobile,
	isTablet,
	displayWidth,
	displayHeight,
}: {
	isMobile: boolean;
	isTablet: boolean;
	displayWidth: number;
	displayHeight: number;
}) {
	if (isMobile) {
		return <MobileScreen height={displayHeight} width={displayWidth} />;
	}
	if (isTablet) {
		return <TabletScreen height={displayHeight} width={displayWidth} />;
	}
	return <DesktopScreen height={displayHeight} width={displayWidth} />;
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
								<div className="font-semibold text-foreground">
									{browserName}
								</div>
								<div className="text-muted-foreground text-xs">
									{row.versions?.length || 0} versions
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
					<div>
						<div className="font-medium">{formatNumber(info.getValue())}</div>
						<div className="text-muted-foreground text-xs">unique users</div>
					</div>
				),
			},
			{
				id: "pageviews",
				accessorKey: "pageviews",
				header: "Pageviews",
				cell: (info: CellContext<BrowserEntry, any>) => (
					<div>
						<div className="font-medium">{formatNumber(info.getValue())}</div>
						<div className="text-muted-foreground text-xs">total views</div>
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

	return (
		<div className="space-y-4">
			<DataTable
				columns={browserColumns}
				data={processedBrowserData}
				description="Expandable browser breakdown showing all versions per browser"
				expandable={true}
				getSubRows={(row: any) => row.versions}
				isLoading={isLoading}
				minHeight={400}
				onAddFilter={handleAddFilter}
				renderSubRow={(subRow: any, parentRow: any) => {
					const percentage = Math.round(
						((subRow.visitors || 0) / (parentRow.visitors || 1)) * 100
					);
					const config = getGradientConfig(percentage);
					return (
						<div
							className="grid grid-cols-4 gap-3 border-l-2 px-4 py-1.5 text-sm transition-all duration-200"
							style={{ background: config.bg, borderLeftColor: config.border }}
						>
							<div className="flex items-center gap-1.5">
								<div className="size-1 rounded-full bg-muted-foreground/40" />
								<span className="font-medium">
									{subRow.version || "Unknown"}
								</span>
							</div>
							<div className="text-right font-medium">
								{formatNumber(subRow.visitors)}
							</div>
							<div className="text-right font-medium">
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
					description="Visitors by location, timezone, and language (limit: 100 per category)"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={400}
					onAddFilter={handleAddFilter}
					tabs={geographicTabs}
					title="Geographic Distribution"
				/>
			</ErrorBoundary>

			<div className="w-full overflow-hidden rounded border bg-card backdrop-blur-sm">
				<div className="border-b p-4 px-2 pb-2 sm:px-3">
					<h3 className="truncate font-semibold text-foreground text-sm">
						Screen Resolutions
					</h3>
					<p className="mt-0.5 text-muted-foreground text-xs">
						Visitors by screen size and device type
					</p>
				</div>

				<div className="p-3 sm:p-4">
					{isLoading ? (
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{Array.from({ length: 6 }).map((_, i) => (
								<div
									className="flex flex-col rounded border bg-accent/20 p-4"
									key={`skel-${i}`}
								>
									<div className="mb-3 flex items-center justify-between">
										<div className="flex items-center gap-2">
											<div className="size-5 animate-pulse rounded bg-muted-foreground/20" />
											<div className="space-y-1">
												<div className="h-4 w-20 animate-pulse rounded bg-muted-foreground/20" />
												<div className="h-3 w-12 animate-pulse rounded bg-muted-foreground/20" />
											</div>
										</div>
										<div className="h-5 w-10 animate-pulse rounded bg-muted-foreground/20" />
									</div>
									<div className="mb-4 flex h-24 items-center justify-center">
										<div className="h-16 w-28 animate-pulse rounded border-2 border-muted-foreground/10 bg-muted-foreground/5" />
									</div>
									<div className="space-y-2">
										<div className="h-1.5 w-full animate-pulse rounded-full bg-muted-foreground/10" />
										<div className="flex justify-between">
											<div className="h-3 w-20 animate-pulse rounded bg-muted-foreground/20" />
											<div className="h-3 w-16 animate-pulse rounded bg-muted-foreground/20" />
										</div>
									</div>
								</div>
							))}
						</div>
					) : deviceData.screen_resolution?.length ? (
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{deviceData.screen_resolution
									.slice(0, 6)
									.map((item: ScreenResolutionEntry) => {
										if (!item.name) {
											return null;
										}
										const [width, height] = item.name.split("x").map(Number);
										const isValid =
											Number.isFinite(width) && Number.isFinite(height);
										const percentage = item.percentage || 0;
										const { type, Icon, isMobile, isTablet } = getDeviceInfo(
											width,
											height,
											isValid
										);
										const display = getDisplayDimensions(
											width,
											height,
											isValid,
											isMobile,
											isTablet
										);

										return (
											<div
												className="group flex flex-col rounded border bg-accent/20 p-4 transition-colors hover:bg-accent/40"
												key={`${item.name}-${item.visitors}`}
											>
												<div className="mb-3 flex items-center justify-between">
													<div className="flex items-center gap-2">
														<Icon
															className="size-4 text-muted-foreground"
															weight="duotone"
														/>
														<div>
															<div className="font-medium text-foreground text-sm">
																{item.name}
															</div>
															<div className="text-muted-foreground text-xs">
																{type}
															</div>
														</div>
													</div>
													<PercentageBadge percentage={percentage} />
												</div>

												<div className="relative mb-4 flex h-24 items-center justify-center">
													<div className="relative flex flex-col items-center">
														<ScreenVisualization
															displayHeight={display.height}
															displayWidth={display.width}
															isMobile={isMobile}
															isTablet={isTablet}
														/>
													</div>
												</div>

												<div className="mt-auto space-y-2">
													<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50">
														<div
															className="h-full rounded-full bg-primary/60 transition-all duration-500"
															style={{ width: `${Math.min(percentage, 100)}%` }}
														/>
													</div>
													<div className="flex items-center justify-between text-muted-foreground text-xs">
														<span className="font-medium text-foreground">
															{formatNumber(item.visitors)} visitors
														</span>
														<span>{formatNumber(item.pageviews)} views</span>
													</div>
												</div>
											</div>
										);
									})}
							</div>
							{deviceData.screen_resolution.length > 6 && (
								<p className="pt-1 text-center text-muted-foreground text-xs">
									Showing top 6 of {deviceData.screen_resolution.length} screen
									resolutions
								</p>
							)}
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<div className="mb-3 flex size-12 items-center justify-center rounded bg-muted">
								<MonitorIcon
									className="size-6 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<h4 className="mb-1 font-medium text-foreground text-sm">
								No screen resolution data
							</h4>
							<p className="max-w-[240px] text-muted-foreground text-xs">
								Resolution data will appear when visitors start using your site
							</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
