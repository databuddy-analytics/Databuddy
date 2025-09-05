'use client';

import {
	ClockIcon,
	DeviceMobileIcon,
	DeviceTabletIcon,
	GlobeIcon,
	InfoIcon,
	LaptopIcon,
	MapPinIcon,
	MonitorIcon,
	TranslateIcon,
	WifiHighIcon,
	WifiLowIcon,
} from '@phosphor-icons/react';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useCallback, useEffect, useMemo } from 'react';
import { DataTable } from '@/components/analytics/data-table';
import { ErrorBoundary } from '@/components/error-boundary';
import { BrowserIcon } from '@/components/icon';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useBatchDynamicQuery } from '@/hooks/use-dynamic-query';
import {
	PercentageBadge,
	type TechnologyTableEntry,
} from '../utils/technology-helpers';
import type { FullTabProps } from '../utils/types';

dayjs.extend(utc);
dayjs.extend(timezone);

interface GeographicEntry {
	name: string;
	visitors: number;
	pageviews: number;
	percentage: number;
	country_code?: string;
	country_name?: string;
}

interface ConnectionEntry extends TechnologyTableEntry {
	category: 'connection';
	iconComponent: React.ReactNode;
}

interface BrowserVersion {
	version: string;
	visitors: number;
	pageviews: number;
	sessions: number;
}

interface BrowserEntry {
	name: string;
	browserName: string;
	visitors: number;
	pageviews: number;
	sessions: number;
	percentage: number;
	versions: BrowserVersion[];
}

interface ScreenResolutionEntry {
	name: string;
	visitors: number;
	pageviews?: number;
}

interface DeviceData {
	device_type: string[];
	browser_name: string[];
	os_name: string[];
	screen_resolution: ScreenResolutionEntry[];
	connection_type: string[];
}

interface ProcessedData {
	geographic: {
		countries: GeographicEntry[];
		regions: GeographicEntry[];
		cities: GeographicEntry[];
		timezones: GeographicEntry[];
		languages: GeographicEntry[];
	};
	device: DeviceData;
}

const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return '0';
	}
	return Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
};

const getConnectionIcon = (connection: string): React.ReactNode => {
	const connectionLower = connection.toLowerCase();
	if (!connection || connection === 'Unknown') {
		return <InfoIcon className="h-4 w-4 text-muted-foreground" />;
	}
	if (connectionLower.includes('wifi')) {
		return <WifiHighIcon className="h-4 w-4 text-green-500" />;
	}
	if (connectionLower.includes('4g')) {
		return <DeviceMobileIcon className="h-4 w-4 text-foreground" />;
	}
	if (connectionLower.includes('5g')) {
		return <DeviceMobileIcon className="h-4 w-4 text-purple-500" />;
	}
	if (connectionLower.includes('3g')) {
		return <DeviceMobileIcon className="h-4 w-4 text-yellow-500" />;
	}
	if (connectionLower.includes('2g')) {
		return <DeviceMobileIcon className="h-4 w-4 text-orange-500" />;
	}
	if (connectionLower.includes('ethernet')) {
		return <LaptopIcon className="h-4 w-4 text-foreground" />;
	}
	if (connectionLower.includes('cellular')) {
		return <DeviceMobileIcon className="h-4 w-4 text-foreground" />;
	}
	if (connectionLower.includes('offline')) {
		return <WifiLowIcon className="h-4 w-4 text-red-500" />;
	}
	return <GlobeIcon className="h-4 w-4 text-primary" />;
};

// API already provides clean, normalized data - no transformation needed

export function WebsiteAudienceTab({
	websiteId,
	dateRange,
	isRefreshing,
	setIsRefreshing,
	filters,
	addFilter,
}: FullTabProps) {
	const batchQueries = useMemo(
		() => [
			{
				id: 'geographic-data',
				parameters: ['country', 'region', 'city', 'timezone', 'language'],
				limit: 100,
				filters,
			},
			{
				id: 'device-data',
				parameters: [
					'device_type',
					'browser_name',
					'os_name',
					'screen_resolution',
					'connection_type',
				],
				limit: 50,
				filters,
			},
		],
		[filters]
	);

	const {
		results: batchResults,
		isLoading: isBatchLoading,
		refetch: refetchBatch,
	} = useBatchDynamicQuery(websiteId, dateRange, batchQueries);

	const handleRefresh = useCallback(async () => {
		if (!isRefreshing) {
			return;
		}

		try {
			await refetchBatch();
		} catch (error) {
			console.error('Failed to refresh audience data:', error);
		} finally {
			setIsRefreshing(false);
		}
	}, [isRefreshing, refetchBatch, setIsRefreshing]);

	useEffect(() => {
		if (isRefreshing) {
			handleRefresh();
		}
	}, [isRefreshing, handleRefresh]);

	const onAddFilter = useCallback(
		(field: string, value: string, _tableTitle?: string) => {
			// The field parameter now contains the correct filter field from the tab configuration
			const filter = {
				field,
				operator: 'eq' as const,
				value,
			};

			addFilter(filter);
		},
		[addFilter]
	);

	const processedData = useMemo((): ProcessedData => {
		if (!batchResults?.length) {
			return {
				geographic: {
					countries: [],
					regions: [],
					cities: [],
					timezones: [],
					languages: [],
				},
				device: {
					device_type: [],
					browser_name: [],
					os_name: [],
					screen_resolution: [],
					connection_type: [],
				},
			};
		}

		const geographicResult = batchResults.find(
			(r) => r.queryId === 'geographic-data'
		);
		const deviceResult = batchResults.find((r) => r.queryId === 'device-data');

		return {
			geographic: {
				countries: geographicResult?.data?.country || [],
				regions: geographicResult?.data?.region || [],
				cities: geographicResult?.data?.city || [],
				timezones: geographicResult?.data?.timezone || [],
				languages: geographicResult?.data?.language || [],
			},
			device: {
				device_type: deviceResult?.data?.device_type || [],
				browser_name: deviceResult?.data?.browser_name || [],
				os_name: deviceResult?.data?.os_name || [],
				screen_resolution: deviceResult?.data?.screen_resolution || [],
				connection_type: deviceResult?.data?.connection_type || [],
			},
		};
	}, [batchResults]);

	const processedBrowserData = useMemo((): BrowserEntry[] => {
		// API already provides clean data with percentages and sorting
		return (processedData.device.browser_name || []).map((browser: any) => ({
			...browser,
			browserName: browser.name,
			sessions: browser.sessions || 0,
			versions: [], // No versions in simple browser data
		}));
	}, [processedData.device.browser_name]);

	const processedConnectionData = useMemo((): ConnectionEntry[] => {
		// API already provides sorted data with percentages
		return (processedData.device.connection_type || []).map((item: any) => ({
			...item,
			iconComponent: getConnectionIcon(item.name || ''),
			category: 'connection' as const,
		}));
	}, [processedData.device.connection_type]);

	const isLoading = isBatchLoading || isRefreshing;

	const browserColumns = useMemo(
		(): ColumnDef<BrowserEntry>[] => [
			{
				id: 'browserName',
				accessorKey: 'browserName',
				header: 'Browser',
				cell: (info: CellContext<BrowserEntry, any>) => {
					const browserName = info.getValue() as string;
					const row = info.row.original;
					return (
						<div className="flex items-center gap-3">
							<BrowserIcon
								fallback={
									<div className="flex h-5 w-5 items-center justify-center rounded bg-muted font-medium text-muted-foreground text-xs">
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
									{row.versions?.length || 0} versions detected
								</div>
							</div>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<BrowserEntry, any>) => (
					<div>
						<div className="font-medium">{formatNumber(info.getValue())}</div>
						<div className="text-muted-foreground text-xs">unique users</div>
					</div>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<BrowserEntry, any>) => (
					<div>
						<div className="font-medium">{formatNumber(info.getValue())}</div>
						<div className="text-muted-foreground text-xs">total views</div>
					</div>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<BrowserEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	const connectionColumns = useMemo(
		(): ColumnDef<ConnectionEntry>[] => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Connection Type',
				cell: (info: CellContext<ConnectionEntry, any>) => {
					const entry = info.row.original;
					return (
						<div className="flex items-center gap-3">
							{entry.iconComponent}
							<span className="font-medium">{entry.name}</span>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<ConnectionEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<ConnectionEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	const geographicColumns = useMemo(
		(): ColumnDef<GeographicEntry>[] => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Location',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const name = info.getValue() as string;
					return (
						<div className="flex items-center gap-2">
							<GlobeIcon className="h-4 w-4 text-primary" />
							<span className="font-medium">{name}</span>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	const countryColumns = useMemo(
		(): ColumnDef<GeographicEntry>[] => [
			{
				id: 'country',
				accessorKey: 'country_name',
				header: 'Country',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const entry = info.row.original;
					const code = entry.country_code;
					const name = entry.country_name || entry.name || 'Unknown';
					return (
						<div className="flex items-center gap-2">
							{code && code !== 'Unknown' ? (
								<img
									alt={code}
									className="h-4 w-5 rounded-sm bg-muted object-cover"
									onError={(e) => {
										(e.target as HTMLImageElement).style.display = 'none';
									}}
									src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${code.toUpperCase()}.svg`}
								/>
							) : (
								<GlobeIcon className="h-3 w-3 text-muted-foreground" />
							)}
							<span className="font-medium">{name}</span>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	const timezoneColumns = useMemo(
		(): ColumnDef<GeographicEntry>[] => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Timezone',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const entry = info.row.original;
					const timezoneName = entry.name;
					return (
						<div className="flex items-center gap-2">
							<ClockIcon className="h-4 w-4 text-primary" />
							<div>
								<div className="font-medium">{timezoneName}</div>
							</div>
						</div>
					);
				},
			},
			{
				id: 'current_time',
				header: 'Current Time',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const entry = info.row.original;
					const timezoneName = entry.name;
					let currentTime = '-';
					try {
						if (timezoneName) {
							currentTime = dayjs().tz(timezoneName).format('hh:mm A');
						}
					} catch {}
					return <span className="font-mono text-xs">{currentTime}</span>;
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	// Feature detection for Intl.DisplayNames
	const canUseDisplayNames = useMemo(() => {
		if (typeof window === 'undefined') {
			return false;
		}
		try {
			// Try to construct and use .of
			const dn = new Intl.DisplayNames([navigator.language || 'en'], {
				type: 'language',
			});
			return typeof dn.of === 'function' && !!dn.of('en');
		} catch {
			return false;
		}
	}, []);

	const displayNames = useMemo(
		() =>
			typeof window !== 'undefined'
				? new Intl.DisplayNames([navigator.language || 'en'], {
						type: 'language',
					})
				: null,
		[]
	);

	const languageColumns = useMemo(
		(): ColumnDef<GeographicEntry>[] => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'Language',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const entry = info.row.original;
					const language = entry.name;
					const code = (entry as any).code;
					let readableName = language;
					try {
						readableName = displayNames?.of(language) || language;
					} catch {
						readableName = language;
					}
					return (
						<div className="flex items-center gap-2">
							<TranslateIcon className="h-4 w-4 text-primary" />
							<div>
								<div className="font-medium">{readableName}</div>
								{code && code !== language && (
									<div className="text-muted-foreground text-xs">{code}</div>
								)}
							</div>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[displayNames]
	);

	const cityColumns = useMemo(
		(): ColumnDef<GeographicEntry>[] => [
			{
				id: 'name',
				accessorKey: 'name',
				header: 'City',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const name = info.getValue() as string;
					return (
						<div className="flex items-center gap-2">
							<MapPinIcon className="h-4 w-4 text-primary" />
							<span className="font-medium">{name}</span>
						</div>
					);
				},
			},
			{
				id: 'visitors',
				accessorKey: 'visitors',
				header: 'Visitors',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'pageviews',
				accessorKey: 'pageviews',
				header: 'Pageviews',
				cell: (info: CellContext<GeographicEntry, any>) => (
					<span className="font-medium">{formatNumber(info.getValue())}</span>
				),
			},
			{
				id: 'percentage',
				accessorKey: 'percentage',
				header: 'Share',
				cell: (info: CellContext<GeographicEntry, any>) => {
					const percentage = info.getValue() as number;
					return <PercentageBadge percentage={percentage} />;
				},
			},
		],
		[]
	);

	const geographicTabs = useMemo(
		() => [
			{
				id: 'countries',
				label: 'Countries',
				data: processedData.geographic.countries,
				columns: countryColumns,
				getFilter: (row: any) => ({
					field: 'country',
					value: row.country_name || row.name,
				}),
			},
			{
				id: 'regions',
				label: 'Regions',
				data: processedData.geographic.regions,
				columns: geographicColumns,
				getFilter: (row: any) => ({
					field: 'region',
					value: row.name,
				}),
			},
			{
				id: 'cities',
				label: 'Cities',
				data: processedData.geographic.cities,
				columns: cityColumns,
				getFilter: (row: any) => ({
					field: 'city',
					value: row.name,
				}),
			},
			...(canUseDisplayNames
				? [
						{
							id: 'languages',
							label: 'Languages',
							data: processedData.geographic.languages,
							columns: languageColumns,
							getFilter: (row: any) => ({
								field: 'language',
								value: row.name,
							}),
						},
					]
				: []),
			{
				id: 'timezones',
				label: 'Timezones',
				data: processedData.geographic.timezones,
				columns: timezoneColumns,
				getFilter: (row: any) => ({
					field: 'timezone',
					value: row.name,
				}),
			},
		],
		[
			processedData.geographic.countries,
			processedData.geographic.regions,
			processedData.geographic.cities,
			processedData.geographic.languages,
			processedData.geographic.timezones,
			countryColumns,
			geographicColumns,
			cityColumns,
			languageColumns,
			timezoneColumns,
			canUseDisplayNames,
		]
	);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="mb-2 font-semibold text-lg">Audience Insights</h2>
				<p className="text-muted-foreground text-sm">
					Detailed information about your website visitors
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<DataTable
					columns={browserColumns}
					data={processedBrowserData}
					description="Expandable browser breakdown showing all versions per browser"
					expandable={true}
					getSubRows={(row: any) => row.versions}
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					renderSubRow={(subRow: any, parentRow: any) => {
						const percentage = Math.round(
							((subRow.visitors || 0) / (parentRow.visitors || 1)) * 100
						);
						const gradientConfig =
							percentage >= 40
								? {
										bg: 'linear-gradient(90deg, rgba(34, 197, 94, 0.12) 0%, rgba(34, 197, 94, 0.06) 100%)',
										border: 'rgba(34, 197, 94, 0.2)',
									}
								: percentage >= 25
									? {
											bg: 'linear-gradient(90deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.06) 100%)',
											border: 'rgba(59, 130, 246, 0.2)',
										}
									: percentage >= 10
										? {
												bg: 'linear-gradient(90deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.06) 100%)',
												border: 'rgba(245, 158, 11, 0.2)',
											}
										: {
												bg: 'linear-gradient(90deg, rgba(107, 114, 128, 0.08) 0%, rgba(107, 114, 128, 0.04) 100%)',
												border: 'rgba(107, 114, 128, 0.15)',
											};

						return (
							<div
								className="grid grid-cols-4 gap-3 border-l-2 px-4 py-1.5 text-sm transition-all duration-200"
								style={{
									background: gradientConfig.bg,
									borderLeftColor: gradientConfig.border,
								}}
							>
								<div className="flex items-center gap-1.5">
									<div className="h-1 w-1 rounded-full bg-muted-foreground/40" />
									<span className="font-medium">
										{subRow.version || 'Unknown'}
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
					showSearch={false}
					tabs={[
						{
							id: 'browsers',
							label: 'Browsers',
							data: processedBrowserData,
							columns: browserColumns,
							getFilter: (row: any) => ({
								field: 'browser_name',
								value: row.browserName || row.name,
							}),
						},
					]}
					title="Browser Versions"
				/>

				<DataTable
					columns={connectionColumns}
					data={processedConnectionData}
					description="Visitors by network connection"
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					showSearch={false}
					tabs={[
						{
							id: 'connections',
							label: 'Connection Types',
							data: processedConnectionData,
							columns: connectionColumns,
							getFilter: (row: any) => ({
								field: 'connection_type',
								value: row.name,
							}),
						},
					]}
					title="Connection Types"
				/>
			</div>

			{/* Enhanced Geographic Data */}
			<div className="grid grid-cols-1 gap-4">
				<ErrorBoundary>
					<DataTable
						description="Visitors by location, timezone, and language (limit: 100 per category)"
						initialPageSize={8}
						isLoading={isLoading}
						minHeight={400}
						onAddFilter={onAddFilter}
						tabs={geographicTabs}
						title="Geographic Distribution"
					/>
				</ErrorBoundary>
			</div>

			{/* Screen Resolutions */}
			<Card className="w-full overflow-hidden border bg-card/50 shadow-sm backdrop-blur-sm">
				<CardHeader className="px-3 pb-2">
					<div className="flex items-start justify-between gap-3">
						<div className="min-w-0 flex-1">
							<h3 className="truncate font-semibold text-foreground text-sm">
								Screen Resolutions
							</h3>
							<p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
								Visitors by screen size and device type
							</p>
						</div>
					</div>
				</CardHeader>

				<CardContent className="overflow-hidden px-3 pb-2">
					{isLoading ? (
						<div className="animate-pulse space-y-3" style={{ minHeight: 400 }}>
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{Array.from({ length: 6 }).map((_, index) => (
									<div
										className="space-y-3 rounded-lg bg-muted/20 p-4"
										key={`skeleton-resolution-card-${index + 1}`}
									>
										<Skeleton className="h-4 w-24 rounded-md" />
										<Skeleton className="h-32 w-full rounded-lg" />
										<div className="space-y-2">
											<div className="flex justify-between">
												<Skeleton className="h-3 w-16 rounded-sm" />
												<Skeleton className="h-3 w-8 rounded-sm" />
											</div>
											<Skeleton className="h-2 w-full rounded-full" />
											<Skeleton className="ml-auto h-3 w-12 rounded-sm" />
										</div>
									</div>
								))}
							</div>
						</div>
					) : processedData.device.screen_resolution?.length ? (
						<div className="space-y-4">
							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
								{processedData.device.screen_resolution
									?.slice(0, 6)
									.map((item: ScreenResolutionEntry) => {
										const resolution = item.name;
										if (!resolution) {
											return null;
										}
										const [width, height] = resolution.split('x').map(Number);
										const isValid = !(
											Number.isNaN(width) || Number.isNaN(height)
										);

										const totalVisitors =
											processedData.device.screen_resolution?.reduce(
												(sum: number, resItem: ScreenResolutionEntry) =>
													sum + resItem.visitors,
												0
											) || 1;
										const percentage = Math.round(
											(item.visitors / totalVisitors) * 100
										);

										let deviceType = 'Unknown';
										let deviceIcon = (
											<MonitorIcon className="h-4 w-4 text-muted-foreground" />
										);

										if (isValid) {
											if (width <= 480) {
												deviceType = 'Mobile';
												deviceIcon = (
													<DeviceMobileIcon className="h-4 w-4 text-foreground" />
												);
											} else if (width <= 1024) {
												deviceType = 'Tablet';
												deviceIcon = (
													<DeviceTabletIcon className="h-4 w-4 text-purple-500" />
												);
											} else if (width <= 1440) {
												deviceType = 'Laptop';
												deviceIcon = (
													<LaptopIcon className="h-4 w-4 text-green-500" />
												);
											} else {
												deviceType = 'Desktop';
												deviceIcon = (
													<MonitorIcon className="h-4 w-4 text-primary" />
												);
											}
										}

										// Create aspect ratio-correct box
										const aspectRatio = isValid ? width / height : 16 / 9;

										return (
											<div
												className="flex flex-col rounded-lg border border-border/50 bg-background/50 p-4 transition-all duration-200 hover:bg-background/80"
												key={`resolution-${resolution}-${item.visitors}`}
											>
												<div className="mb-3 flex items-center justify-between">
													<div className="flex items-center gap-2">
														{deviceIcon}
														<div>
															<div className="font-medium text-sm">
																{resolution}
															</div>
															<div className="text-muted-foreground text-xs">
																{deviceType}
															</div>
														</div>
													</div>
													<div className="text-right">
														<div className="font-medium text-sm">
															{percentage}%
														</div>
													</div>
												</div>

												{/* Enhanced Screen visualization with perspective */}
												<div className="perspective relative mb-4 flex h-32 justify-center">
													<div
														className="relative flex transform-gpu items-center justify-center rounded-lg border-2 border-primary/20 bg-gradient-to-br from-primary/8 to-primary/12 shadow-lg transition-all duration-300 hover:shadow-xl"
														style={{
															width: `${Math.min(200, 100 * Math.sqrt(aspectRatio))}px`,
															height: `${Math.min(160, 100 / Math.sqrt(aspectRatio))}px`,
															transformStyle: 'preserve-3d',
															transform: 'rotateY(-8deg) rotateX(3deg)',
															margin: 'auto',
														}}
													>
														{isValid && (
															<div
																className="transform-gpu font-mono font-semibold text-primary text-xs"
																style={{ transform: 'translateZ(5px)' }}
															>
																{width} × {height}
															</div>
														)}

														{/* Enhanced Screen content simulation */}
														<div
															className="absolute inset-2 rounded bg-background/20"
															style={{ transform: 'translateZ(2px)' }}
														/>

														{/* Browser-like UI elements */}
														<div
															className="absolute top-2 right-2 left-2 h-1.5 rounded-full bg-primary/30"
															style={{ transform: 'translateZ(3px)' }}
														/>
														<div
															className="absolute top-5 left-2 h-1 w-1/2 rounded-full bg-primary/20"
															style={{ transform: 'translateZ(3px)' }}
														/>
														<div
															className="absolute inset-x-2 bottom-4 grid grid-cols-3 gap-1"
															style={{ transform: 'translateZ(3px)' }}
														>
															<div className="h-1 rounded-full bg-primary/15" />
															<div className="h-1 rounded-full bg-primary/20" />
															<div className="h-1 rounded-full bg-primary/15" />
														</div>
													</div>

													{/* Stand or base for desktop/laptop */}
													{(deviceType === 'Desktop' ||
														deviceType === 'Laptop') && (
														<div
															className="absolute bottom-0 mx-auto h-3 w-1/4 rounded-b-md bg-muted/60"
															style={{
																left: '50%',
																transform: 'translateX(-50%)',
																boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
															}}
														/>
													)}
												</div>

												<div className="mt-auto space-y-2">
													<div className="flex items-center justify-between text-sm">
														<span className="font-medium">
															{formatNumber(item.visitors)} visitors
														</span>
													</div>
													<div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
														<div
															className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
															style={{ width: `${percentage}%` }}
														/>
													</div>
													<div className="flex items-center justify-between text-muted-foreground text-xs">
														<span>
															{formatNumber(item.pageviews)} pageviews
														</span>
														<span>{percentage}% share</span>
													</div>
												</div>
											</div>
										);
									})}
							</div>

							{processedData.device.screen_resolution &&
								processedData.device.screen_resolution.length > 6 && (
									<div className="border-border/30 border-t pt-2 text-center text-muted-foreground text-xs">
										Showing top 6 of{' '}
										{processedData.device.screen_resolution.length} screen
										resolutions
									</div>
								)}
						</div>
					) : (
						<div
							className="flex flex-col items-center justify-center py-16 text-center"
							style={{ minHeight: 400 }}
						>
							<div className="mb-4">
								<div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/20">
									<MonitorIcon className="h-7 w-7 text-muted-foreground/50" />
								</div>
							</div>
							<h4 className="mb-2 font-medium text-base text-foreground">
								No screen resolution data available
							</h4>
							<p className="max-w-[280px] text-muted-foreground text-sm">
								Resolution data will appear here when visitors start using your
								website.
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
