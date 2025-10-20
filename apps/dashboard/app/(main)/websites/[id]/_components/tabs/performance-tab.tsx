'use client';

import { getCountryCode, getCountryName } from '@databuddy/shared';
import { LightningIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CountryFlag } from '@/components/analytics/icons/CountryFlag';
import { BrowserIcon, OSIcon } from '@/components/icon';
import { DataTable } from '@/components/table/data-table';
import { useEnhancedPerformanceData } from '@/hooks/use-dynamic-query';
import { calculatePerformanceSummary } from '@/lib/performance-utils';
import type { PerformanceEntry } from '@/types/performance';
import type { FullTabProps } from '../utils/types';
import { PerformanceMetricCell } from './performance/_components/performance-metric-cell';
import { PerformanceSummaryCard } from './performance/_components/performance-summary-card';
import { WebVitalsChart } from './performance/_components/web-vitals-chart';
import { WebVitalsMetricCell } from './performance/_components/web-vitals-metric-cell';
import { formatNumber } from './performance/_utils/performance-utils';

interface CellProps {
	getValue: () => unknown;
	row: { original: Record<string, unknown> };
}

const performanceColumns = [
	{
		id: 'visitors',
		accessorKey: 'visitors',
		header: 'Visitors',
		cell: ({ getValue }: CellProps) => formatNumber(getValue() as number),
	},
	{
		id: 'avg_load_time',
		accessorKey: 'avg_load_time',
		header: 'Load Time',
		cell: ({ row }: CellProps) => (
			<PerformanceMetricCell value={row.original.avg_load_time as number} />
		),
	},
	{
		id: 'avg_ttfb',
		accessorKey: 'avg_ttfb',
		header: 'TTFB',
		cell: ({ row }: CellProps) => (
			<PerformanceMetricCell value={row.original.avg_ttfb as number} />
		),
	},
	{
		id: 'avg_dom_ready_time',
		accessorKey: 'avg_dom_ready_time',
		header: 'DOM Ready',
		cell: ({ row }: CellProps) => (
			<PerformanceMetricCell
				value={row.original.avg_dom_ready_time as number}
			/>
		),
	},
	{
		id: 'avg_render_time',
		accessorKey: 'avg_render_time',
		header: 'Render Time',
		cell: ({ row }: CellProps) => (
			<PerformanceMetricCell value={row.original.avg_render_time as number} />
		),
	},
];

const webVitalsColumns = [
	{
		id: 'visitors',
		accessorKey: 'visitors',
		header: 'Visitors',
		cell: ({ getValue }: CellProps) => formatNumber(getValue() as number),
	},
	{
		id: 'avg_lcp',
		accessorKey: 'avg_lcp',
		header: 'LCP',
		cell: ({ row }: CellProps) => (
			<WebVitalsMetricCell
				metric="lcp"
				value={row.original.avg_lcp as number}
			/>
		),
	},
	{
		id: 'avg_fcp',
		accessorKey: 'avg_fcp',
		header: 'FCP',
		cell: ({ row }: CellProps) => (
			<WebVitalsMetricCell
				metric="fcp"
				value={row.original.avg_fcp as number}
			/>
		),
	},
	{
		id: 'avg_fid',
		accessorKey: 'avg_fid',
		header: 'FID',
		cell: ({ row }: CellProps) => (
			<WebVitalsMetricCell
				metric="fid"
				value={row.original.avg_fid as number}
			/>
		),
	},
	{
		id: 'avg_inp',
		accessorKey: 'avg_inp',
		header: 'INP',
		cell: ({ row }: CellProps) => (
			<WebVitalsMetricCell
				metric="inp"
				value={row.original.avg_inp as number}
			/>
		),
	},
];

const createNameColumn = (
	header: string,
	iconRenderer?: (name: string) => React.ReactNode,
	nameFormatter?: (name: string) => string
) => ({
	id: 'name',
	accessorKey: 'name',
	header,
	cell: ({ getValue }: CellProps) => {
		const name = getValue() as string;
		const displayName = nameFormatter ? nameFormatter(name) : name;
		return (
			<div className="flex items-center gap-2">
				{iconRenderer?.(name)}
				<span className="truncate">{displayName}</span>
			</div>
		);
	},
});

export function WebsitePerformanceTab({
	websiteId,
	dateRange,
	isRefreshing,
	setIsRefreshing,
	filters,
	addFilter,
}: FullTabProps) {
	const [activeFilter, setActiveFilter] = useState<'fast' | 'slow' | null>(
		null
	);

	const {
		results: performanceResults,
		isLoading,
		refetch,
		error,
	} = useEnhancedPerformanceData(websiteId, dateRange, filters);

	const handleRefresh = useCallback(async () => {
		if (isRefreshing) {
			try {
				await refetch();
			} finally {
				setIsRefreshing(false);
			}
		}
	}, [isRefreshing, refetch, setIsRefreshing]);

	useEffect(() => {
		handleRefresh();
	}, [handleRefresh]);

	const filterPagesByPerformance = useCallback(
		(pages: PerformanceEntry[], filter: 'fast' | 'slow' | null) => {
			if (!filter) {
				return pages;
			}
			return pages.filter((page) => {
				const loadTime = page.avg_load_time || 0;
				return filter === 'fast' ? loadTime < 1500 : loadTime >= 3000;
			});
		},
		[]
	);

	const onAddFilter = useCallback(
		(field: string, value: string) => {
			addFilter({ field, operator: 'eq' as const, value });
		},
		[addFilter]
	);

	const { processedData, performanceSummary } = useMemo(() => {
		if (!performanceResults?.length) {
			return {
				processedData: {
					pages: [],
					allPages: [],
					countries: [],
					browsers: [],
					operating_systems: [],
					regions: [],
					webVitalsTimeSeries: [],
					webVitalsByPage: [],
					webVitalsByBrowser: [],
					webVitalsByCountry: [],
					webVitalsByOS: [],
					webVitalsByRegion: [],
				},
				performanceSummary: {
					performanceScore: 0,
					avgLoadTime: 0,
					fastPages: 0,
					slowPages: 0,
					totalPages: 0,
				},
			};
		}

		const data: Record<string, unknown> = {};
		for (const result of performanceResults) {
			if (result.success && result.data) {
				Object.assign(data, result.data);
			}
		}

		const allPages = (data.slow_pages as PerformanceEntry[]) || [];
		const filteredPages = filterPagesByPerformance(allPages, activeFilter);

		const processedPerformanceData = {
			pages: filteredPages,
			allPages,
			countries: (data.performance_by_country as PerformanceEntry[]) || [],
			browsers: (data.performance_by_browser as PerformanceEntry[]) || [],
			operating_systems: (data.performance_by_os as PerformanceEntry[]) || [],
			regions: (data.performance_by_region as PerformanceEntry[]) || [],
			webVitalsTimeSeries:
				(data.web_vitals_time_series as Record<string, unknown>[]) || [],
			webVitalsByPage: (data.web_vitals_by_page as unknown[]) || [],
			webVitalsByBrowser: (data.web_vitals_by_browser as unknown[]) || [],
			webVitalsByCountry: (data.web_vitals_by_country as unknown[]) || [],
			webVitalsByOS: (data.web_vitals_by_os as unknown[]) || [],
			webVitalsByRegion: (data.web_vitals_by_region as unknown[]) || [],
		};

		return {
			processedData: processedPerformanceData,
			performanceSummary: calculatePerformanceSummary(allPages),
		};
	}, [performanceResults, activeFilter, filterPagesByPerformance]);

	const tabs = useMemo(() => {
		const formatPageName = (name: string) => {
			try {
				return name.startsWith('http') ? new URL(name).pathname : name;
			} catch {
				return name.startsWith('/') ? name : `/${name}`;
			}
		};

		const getCountryIcon = (name: string) => {
			const countryItem = processedData.countries.find(
				(item) => (item as { country_name?: string }).country_name === name
			);
			return (
				<CountryFlag
					country={
						(countryItem as { country_code?: string })?.country_code || name
					}
					size={16}
				/>
			);
		};

		const getRegionCountryIcon = (name: string) => {
			if (typeof name !== 'string' || !name.includes(',')) {
				return <CountryFlag country={''} size={16} />;
			}
			const countryPart = name.split(',')[1]?.trim();
			const code = getCountryCode(countryPart || '');
			return <CountryFlag country={code} size={16} />;
		};

		const formatRegionName = (name: string) => {
			if (typeof name !== 'string' || !name.includes(',')) {
				return name || 'Unknown region';
			}
			const [region, countryPart] = name.split(',').map((s) => s.trim());
			if (!(region && countryPart)) {
				return name || 'Unknown region';
			}
			const code = getCountryCode(countryPart);
			const countryName = getCountryName(code);
			if (
				countryName &&
				region &&
				countryName.toLowerCase() === region.toLowerCase()
			) {
				return countryName;
			}
			return countryName ? `${region}, ${countryName}` : name;
		};

		interface TabConfig {
			id: string;
			label: string;
			data: PerformanceEntry[];
			iconRenderer?: (name: string) => React.ReactNode;
			nameFormatter?: (name: string) => string;
			getFilter: (row: { name: string }) => { field: string; value: string };
		}

		const configs: TabConfig[] = [
			{
				id: 'pages',
				label: 'Pages',
				data: processedData.pages,
				iconRenderer: undefined,
				nameFormatter: formatPageName,
				getFilter: (row) => ({ field: 'path', value: row.name }),
			},
			{
				id: 'countries',
				label: 'Country',
				data: processedData.countries,
				iconRenderer: getCountryIcon,
				getFilter: (row) => ({ field: 'country', value: row.name }),
			},
			{
				id: 'regions',
				label: 'Regions',
				data: processedData.regions,
				iconRenderer: getRegionCountryIcon,
				nameFormatter: formatRegionName,
				getFilter: (row) => ({ field: 'region', value: row.name }),
			},
			{
				id: 'browsers',
				label: 'Browsers',
				data: processedData.browsers,
				iconRenderer: (name: string) => <BrowserIcon name={name} size="sm" />,
				getFilter: (row) => ({ field: 'browser_name', value: row.name }),
			},
			{
				id: 'operating_systems',
				label: 'Operating Systems',
				data: processedData.operating_systems,
				iconRenderer: (name: string) => <OSIcon name={name} size="sm" />,
				getFilter: (row) => ({ field: 'os_name', value: row.name }),
			},
		];

		return configs.map((config) => ({
			id: config.id,
			label: config.label,
			data: config.data.map((item, i) => ({
				name:
					(item as { country_name?: string }).country_name ||
					item.name ||
					'Unknown',
				visitors: item.visitors || 0,
				avg_load_time: item.avg_load_time || 0,
				avg_ttfb: item.avg_ttfb,
				avg_dom_ready_time: item.avg_dom_ready_time,
				avg_render_time: item.avg_render_time,
				country_code: (item as { country_code?: string }).country_code,
				_uniqueKey: `${config.id}-${i}`,
			})),
			columns: [
				createNameColumn(
					config.label,
					config.iconRenderer,
					config.nameFormatter
				),
				...performanceColumns,
			],
			getFilter: config.getFilter,
		}));
	}, [processedData]);

	const webVitalsTabs = useMemo(() => {
		const formatPageName = (name: string) => {
			try {
				return name.startsWith('http') ? new URL(name).pathname : name;
			} catch {
				return name.startsWith('/') ? name : `/${name}`;
			}
		};

		const getCountryIcon = (name: string) => {
			const countryItem = processedData.webVitalsByCountry.find(
				(item) => (item as { country_name?: string }).country_name === name
			);
			return (
				<CountryFlag
					country={
						(countryItem as { country_code?: string })?.country_code || name
					}
					size={16}
				/>
			);
		};

		const getRegionCountryIcon = (name: string) => {
			if (typeof name !== 'string' || !name.includes(',')) {
				return <CountryFlag country={''} size={16} />;
			}
			const countryPart = name.split(',')[1]?.trim();
			const code = getCountryCode(countryPart || '');
			return <CountryFlag country={code} size={16} />;
		};

		const formatRegionName = (name: string) => {
			if (typeof name !== 'string' || !name.includes(',')) {
				return name || 'Unknown region';
			}
			const [region, countryPart] = name.split(',').map((s) => s.trim());
			if (!(region && countryPart)) {
				return name || 'Unknown region';
			}
			const code = getCountryCode(countryPart);
			const countryName = getCountryName(code);
			if (
				countryName &&
				region &&
				countryName.toLowerCase() === region.toLowerCase()
			) {
				return countryName;
			}
			return countryName ? `${region}, ${countryName}` : name;
		};

		interface WebVitalsTabConfig {
			id: string;
			label: string;
			data: unknown[];
			iconRenderer?: (name: string) => React.ReactNode;
			nameFormatter?: (name: string) => string;
			getFilter: (row: { name: string }) => { field: string; value: string };
		}

		const webVitalsConfigs: WebVitalsTabConfig[] = [
			{
				id: 'web-vitals-pages',
				label: 'Pages',
				data: processedData.webVitalsByPage,
				iconRenderer: undefined,
				nameFormatter: formatPageName,
				getFilter: (row) => ({ field: 'path', value: row.name }),
			},
			{
				id: 'web-vitals-countries',
				label: 'Country',
				data: processedData.webVitalsByCountry,
				iconRenderer: getCountryIcon,
				getFilter: (row) => ({ field: 'country', value: row.name }),
			},
			{
				id: 'web-vitals-regions',
				label: 'Regions',
				data: processedData.webVitalsByRegion,
				iconRenderer: getRegionCountryIcon,
				nameFormatter: formatRegionName,
				getFilter: (row) => ({ field: 'region', value: row.name }),
			},
			{
				id: 'web-vitals-browsers',
				label: 'Browsers',
				data: processedData.webVitalsByBrowser,
				iconRenderer: (name: string) => <BrowserIcon name={name} size="sm" />,
				getFilter: (row) => ({ field: 'browser_name', value: row.name }),
			},
			{
				id: 'web-vitals-os',
				label: 'Operating Systems',
				data: processedData.webVitalsByOS,
				iconRenderer: (name: string) => <OSIcon name={name} size="sm" />,
				getFilter: (row) => ({ field: 'os_name', value: row.name }),
			},
		];

		return webVitalsConfigs.map((config) => ({
			id: config.id,
			label: config.label,
			data: (config.data as Record<string, unknown>[]).map((item, i) => ({
				name:
					(item as { country_name?: string }).country_name ||
					(item as { name?: string }).name ||
					'Unknown',
				visitors: (item as { visitors?: number }).visitors || 0,
				avg_lcp: (item as { avg_lcp?: number }).avg_lcp,
				avg_fcp: (item as { avg_fcp?: number }).avg_fcp,
				avg_fid: (item as { avg_fid?: number }).avg_fid,
				avg_inp: (item as { avg_inp?: number }).avg_inp,
				country_code: (item as { country_code?: string }).country_code,
				_uniqueKey: `${config.id}-${i}`,
			})),
			columns: [
				createNameColumn(
					config.label,
					config.iconRenderer,
					config.nameFormatter
				),
				...webVitalsColumns,
			],
			getFilter: config.getFilter,
		}));
	}, [processedData]);

	if (error) {
		return (
			<div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/20">
				<p className="text-red-600 text-sm dark:text-red-400">
					Failed to load performance data. Please try refreshing.
				</p>
			</div>
		);
	}

	const hasData =
		!isLoading &&
		(processedData.allPages?.length > 0 || processedData.pages.length > 0);
	const description = activeFilter
		? `Showing ${activeFilter} pages only. Detailed performance metrics across pages, locations, devices, and browsers`
		: 'Detailed performance metrics across pages, locations, devices, and browsers';

	return (
		<div className="space-y-4">
			<WebVitalsChart
				data={
					processedData.webVitalsTimeSeries as {
						date: string;
						[key: string]: unknown;
					}[]
				}
				isLoading={isLoading}
				isRefreshing={isRefreshing}
				onAddFilter={onAddFilter}
				webVitalsTabs={webVitalsTabs}
			/>

			<div className="rounded border bg-muted/20 p-4">
				<div className="mb-4 flex items-start gap-2">
					<LightningIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
					<div>
						<p className="mb-1 font-medium text-foreground">
							Performance Overview
						</p>
						<p className="text-muted-foreground text-xs">
							Core Web Vitals and performance metrics.{' '}
							<span className="font-medium text-green-600">Good</span>,
							<span className="ml-1 font-medium text-yellow-600">
								Needs Improvement
							</span>
							,<span className="ml-1 font-medium text-red-600">Poor</span>{' '}
							ratings.
						</p>
					</div>
				</div>

				{hasData ? (
					<>
						<PerformanceSummaryCard
							activeFilter={activeFilter}
							onFilterChange={setActiveFilter}
							summary={performanceSummary}
						/>

						<div className="mt-6">
							<DataTable
								description={description}
								isLoading={isLoading || isRefreshing}
								minHeight={500}
								onAddFilter={onAddFilter}
								tabs={tabs}
								title="Performance Analysis"
							/>
						</div>
					</>
				) : isLoading ? (
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
							<p className="text-muted-foreground text-sm">
								Loading performance data...
							</p>
						</div>
					</div>
				) : (
					<div className="flex items-center justify-center py-12">
						<div className="text-center">
							<p className="text-muted-foreground text-sm">
								No performance data available for the selected period.
							</p>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
