'use client';

import {
	ChartLineIcon,
	CursorIcon,
	GlobeIcon,
	LayoutIcon,
	TimerIcon,
	UsersIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import type { ColumnDef } from '@tanstack/react-table';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useAtom } from 'jotai';
import dynamic from 'next/dynamic';
import { useCallback, useMemo } from 'react';
import {
	DataTable,
	DeviceTypeCell,
	EventLimitIndicator,
	StatCard,
	UnauthorizedAccessError,
} from '@/components/analytics';
import {
	ReferrerSourceCell,
	type ReferrerSourceCellData,
} from '@/components/atomic/ReferrerSourceCell';
import { MetricsChart } from '@/components/charts/metrics-chart';
import { BrowserIcon, OSIcon } from '@/components/icon';
import { useBatchDynamicQuery } from '@/hooks/use-dynamic-query';
import { getUserTimezone } from '@/lib/timezone';
import {
	metricVisibilityAtom,
	toggleMetricAtom,
} from '@/stores/jotai/chartAtoms';
import {
	calculatePercentChange,
	formatDateByGranularity,
	getColorVariant,
} from '../utils/analytics-helpers';
import { PercentageBadge } from '../utils/technology-helpers';
import type { FullTabProps, MetricPoint } from '../utils/types';

const CustomEventsSection = dynamic(() =>
	import('./overview/_components/custom-events-section').then((mod) => ({
		default: mod.CustomEventsSection,
	}))
);

interface ChartDataPoint {
	date: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	avg_session_duration?: number;
	[key: string]: unknown;
}

interface TechnologyData {
	name: string;
	visitors: number;
	pageviews?: number;
	percentage: number;
	icon?: string;
	category?: string;
}

interface CellInfo {
	getValue: () => unknown;
	row: { original: unknown };
}

interface AnalyticsRowData {
	name: string;
	visitors?: number;
	pageviews?: number;
	percentage?: number;
	referrer?: string;
}

interface PageRowData {
	name: string;
	visitors?: number;
	pageviews?: number;
	percentage?: number;
}

// Constants
const MIN_PREVIOUS_SESSIONS_FOR_TREND = 5;
const MIN_PREVIOUS_VISITORS_FOR_TREND = 5;
const MIN_PREVIOUS_PAGEVIEWS_FOR_TREND = 10;

// Configuration
const QUERY_CONFIG = {
	limit: 100,
	parameters: {
		summary: ['summary_metrics', 'today_metrics', 'events_by_date'] as string[],
		pages: [
			'top_pages',
			'entry_pages',
			'exit_pages',
			'page_time_analysis',
		] as string[],
		traffic: [
			'top_referrers',
			'utm_sources',
			'utm_mediums',
			'utm_campaigns',
		] as string[],
		tech: ['device_types', 'browsers', 'operating_systems'] as string[],
		customEvents: [
			'custom_events',
			'custom_event_properties',
			'outbound_links',
			'outbound_domains',
		] as string[],
	},
} as const;

export function WebsiteOverviewTab({
	websiteId,
	dateRange,
	filters,
	addFilter,
}: Omit<FullTabProps, 'isRefreshing' | 'setIsRefreshing'>) {
	const calculatePreviousPeriod = useCallback(
		(currentRange: typeof dateRange) => {
			const startDate = dayjs(currentRange.start_date);
			const daysDiff = dayjs(currentRange.end_date).diff(startDate, 'day');

			return {
				start_date: startDate
					.subtract(daysDiff + 1, 'day')
					.format('YYYY-MM-DD'),
				end_date: startDate.subtract(1, 'day').format('YYYY-MM-DD'),
				granularity: currentRange.granularity,
			};
		},
		[]
	);

	const previousPeriodRange = useMemo(
		() => calculatePreviousPeriod(dateRange),
		[dateRange, calculatePreviousPeriod]
	);

	const queries = [
		{
			id: 'overview-summary',
			parameters: [
				'summary_metrics',
				'today_metrics',
				'events_by_date',
				{
					name: 'summary_metrics',
					start_date: previousPeriodRange.start_date,
					end_date: previousPeriodRange.end_date,
					granularity: previousPeriodRange.granularity,
					id: 'previous_summary_metrics',
				},
				{
					name: 'events_by_date',
					start_date: previousPeriodRange.start_date,
					end_date: previousPeriodRange.end_date,
					granularity: previousPeriodRange.granularity,
					id: 'previous_events_by_date',
				},
			],
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: 'overview-pages',
			parameters: QUERY_CONFIG.parameters.pages,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: 'overview-traffic',
			parameters: QUERY_CONFIG.parameters.traffic,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: 'overview-tech',
			parameters: QUERY_CONFIG.parameters.tech,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: 'overview-custom-events',
			parameters: QUERY_CONFIG.parameters.customEvents,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
	];

	const { isLoading, error, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const analytics = {
		summary:
			getDataForQuery('overview-summary', 'summary_metrics')?.[0] || null,
		today: getDataForQuery('overview-summary', 'today_metrics')?.[0] || null,
		events_by_date: getDataForQuery('overview-summary', 'events_by_date') || [],
		top_pages: getDataForQuery('overview-pages', 'top_pages') || [],
		entry_pages: getDataForQuery('overview-pages', 'entry_pages') || [],
		exit_pages: getDataForQuery('overview-pages', 'exit_pages') || [],
		page_time_analysis:
			getDataForQuery('overview-pages', 'page_time_analysis') || [],
		top_referrers: getDataForQuery('overview-traffic', 'top_referrers') || [],
		utm_sources: getDataForQuery('overview-traffic', 'utm_sources') || [],
		utm_mediums: getDataForQuery('overview-traffic', 'utm_mediums') || [],
		utm_campaigns: getDataForQuery('overview-traffic', 'utm_campaigns') || [],
		device_types: getDataForQuery('overview-tech', 'device_types') || [],
		browser_versions: getDataForQuery('overview-tech', 'browsers') || [],
		operating_systems:
			getDataForQuery('overview-tech', 'operating_systems') || [],
	};

	const customEventsData = {
		custom_events:
			getDataForQuery('overview-custom-events', 'custom_events') || [],
		custom_event_properties:
			getDataForQuery('overview-custom-events', 'custom_event_properties') ||
			[],
		outbound_links:
			getDataForQuery('overview-custom-events', 'outbound_links') || [],
		outbound_domains:
			getDataForQuery('overview-custom-events', 'outbound_domains') || [],
	};

	const [visibleMetrics] = useAtom(metricVisibilityAtom);
	const [, toggleMetricAction] = useAtom(toggleMetricAtom);

	const toggleMetric = useCallback(
		(metric: string) => {
			if (metric in visibleMetrics) {
				toggleMetricAction(metric as keyof typeof visibleMetrics);
			}
		},
		[visibleMetrics, toggleMetricAction]
	);

	const hiddenMetrics = useMemo(() => {
		const result: Record<string, boolean> = {};
		for (const key of Object.keys(visibleMetrics)) {
			result[key] = !visibleMetrics[key as keyof typeof visibleMetrics];
		}
		return result;
	}, [visibleMetrics]);

	const createPercentageCell = () => (info: CellInfo) => {
		const percentage = info.getValue() as number;
		return <PercentageBadge percentage={percentage} />;
	};

	const referrerCustomCell = (info: CellInfo) => {
		const cellData = info.row.original as ReferrerSourceCellData;
		return <ReferrerSourceCell {...cellData} />;
	};

	const referrerTabs = [
		{
			id: 'referrers',
			label: 'Referrers',
			data: analytics.top_referrers || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Source',
					cell: referrerCustomCell,
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => {
				return {
					field: 'referrer',
					value: row.referrer || '',
				};
			},
		},
		{
			id: 'utm_sources',
			label: 'UTM Sources',
			data: analytics.utm_sources || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Source',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: 'utm_source',
				value: row.name,
			}),
		},
		{
			id: 'utm_mediums',
			label: 'UTM Mediums',
			data: analytics.utm_mediums || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Medium',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: 'utm_medium',
				value: row.name,
			}),
		},
		{
			id: 'utm_campaigns',
			label: 'UTM Campaigns',
			data: analytics.utm_campaigns || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Campaign',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: 'utm_campaign',
				value: row.name,
			}),
		},
	];

	const dateFrom = dayjs(dateRange.start_date);
	const dateTo = dayjs(dateRange.end_date);
	const dateDiff = dateTo.diff(dateFrom, 'day');

	const filterFutureEvents = useCallback(
		(events: MetricPoint[]) => {
			const userTimezone = getUserTimezone();
			const now = dayjs().tz(userTimezone);

			return events.filter((event: MetricPoint) => {
				const eventDate = dayjs.utc(event.date).tz(userTimezone);

				if (dateRange.granularity === 'hourly') {
					return eventDate.isBefore(now);
				}

				const endOfToday = now.endOf('day');
				return (
					eventDate.isBefore(endOfToday) || eventDate.isSame(endOfToday, 'day')
				);
			});
		},
		[dateRange.granularity]
	);

	const chartData = useMemo(() => {
		if (!analytics.events_by_date?.length) {
			return [];
		}
		const filteredEvents = filterFutureEvents(analytics.events_by_date);
		return filteredEvents.map((event: MetricPoint): ChartDataPoint => {
			const filtered: ChartDataPoint = {
				date: formatDateByGranularity(event.date, dateRange.granularity),
			};
			if (visibleMetrics.pageviews) {
				filtered.pageviews = event.pageviews as number;
			}
			if (visibleMetrics.visitors) {
				filtered.visitors =
					(event.visitors as number) || (event.unique_visitors as number) || 0;
			}
			if (visibleMetrics.sessions) {
				filtered.sessions = event.sessions as number;
			}
			if (visibleMetrics.bounce_rate) {
				filtered.bounce_rate = event.bounce_rate as number;
			}
			if (visibleMetrics.avg_session_duration) {
				filtered.avg_session_duration = event.avg_session_duration as number;
			}
			return filtered;
		});
	}, [
		analytics.events_by_date,
		dateRange.granularity,
		visibleMetrics,
		filterFutureEvents,
	]);

	const miniChartData = useMemo(() => {
		if (!analytics.events_by_date?.length) {
			return {};
		}
		const filteredEvents = filterFutureEvents(analytics.events_by_date);
		const createChartSeries = (
			field: keyof MetricPoint,
			transform?: (value: number) => number
		) =>
			filteredEvents.map((event: MetricPoint) => ({
				date:
					dateRange.granularity === 'hourly'
						? event.date
						: event.date.slice(0, 10),
				value: transform
					? transform(event[field] as number)
					: (event[field] as number) || 0,
			}));
		return {
			visitors: createChartSeries('visitors'),
			sessions: createChartSeries('sessions'),
			pageviews: createChartSeries('pageviews'),
			pagesPerSession: createChartSeries('pages_per_session'),
			bounceRate: createChartSeries('bounce_rate'),
			sessionDuration: createChartSeries('avg_session_duration', (value) => {
				if (value < 60) {
					return Math.round(value);
				}
				const minutes = Math.floor(value / 60);
				const seconds = Math.round(value % 60);
				return minutes * 60 + seconds;
			}),
		};
	}, [analytics.events_by_date, dateRange.granularity, filterFutureEvents]);

	const createTechnologyCell = (type: 'browser' | 'os') => (info: CellInfo) => {
		const entry = info.row.original as TechnologyData;
		const IconComponent = type === 'browser' ? BrowserIcon : OSIcon;
		return (
			<div className="flex items-center gap-3">
				<IconComponent name={entry.name} size="md" />
				<span className="font-medium">{entry.name}</span>
			</div>
		);
	};

	const formatNumber = useCallback(
		(value: number | null | undefined): string => {
			if (value == null || Number.isNaN(value)) {
				return '0';
			}
			return Intl.NumberFormat(undefined, {
				notation: 'compact',
				maximumFractionDigits: 1,
			}).format(value);
		},
		[]
	);

	const formatTimeSeconds = useCallback((seconds: number): string => {
		if (seconds < 60) {
			return `${seconds.toFixed(1)}s`;
		}
		const minutes = Math.floor(seconds / 60);
		const remainingSeconds = Math.round(seconds % 60);
		return `${minutes}m ${remainingSeconds}s`;
	}, []);

	const createTimeCell = (info: CellInfo) => {
		const seconds = info.getValue() as number;
		return (
			<span className="font-medium text-foreground">
				{formatTimeSeconds(seconds)}
			</span>
		);
	};

	const pageTimeColumns = [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Page',
			cell: (info: CellInfo) => {
				const name = info.getValue() as string;
				return (
					<span className="font-medium text-foreground" title={name}>
						{name}
					</span>
				);
			},
		},
		{
			id: 'median_time_on_page',
			accessorKey: 'median_time_on_page',
			header: 'Avg Time',
			cell: createTimeCell,
		},
		{
			id: 'sessions_with_time',
			accessorKey: 'sessions_with_time',
			header: 'Sessions',
			cell: (info: CellInfo) => (
				<span className="font-medium text-foreground">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellInfo) => (
				<span className="font-medium text-foreground">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage_of_sessions',
			accessorKey: 'percentage_of_sessions',
			header: 'Share',
			cell: createPercentageCell(),
		},
	];

	const pagesTabs = [
		{
			id: 'top_pages',
			label: 'Top Pages',
			data: analytics.top_pages || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Page',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<PageRowData, unknown>[],
			getFilter: (row: PageRowData) => ({
				field: 'path',
				value: row.name,
			}),
		},
		{
			id: 'entry_pages',
			label: 'Entry Pages',
			data: analytics.entry_pages || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Page',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<PageRowData, unknown>[],
			getFilter: (row: PageRowData) => ({
				field: 'path',
				value: row.name,
			}),
		},
		{
			id: 'exit_pages',
			label: 'Exit Pages',
			data: analytics.exit_pages || [],
			columns: [
				{
					id: 'name',
					accessorKey: 'name',
					header: 'Page',
					cell: (info: CellInfo) => {
						const name = info.getValue() as string;
						return (
							<span className="font-medium text-foreground" title={name}>
								{name}
							</span>
						);
					},
				},
				{
					id: 'visitors',
					accessorKey: 'visitors',
					header: 'Visitors',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'pageviews',
					accessorKey: 'pageviews',
					header: 'Views',
					cell: (info: CellInfo) => (
						<span className="font-medium text-foreground">
							{formatNumber(info.getValue() as number)}
						</span>
					),
				},
				{
					id: 'percentage',
					accessorKey: 'percentage',
					header: 'Share',
					cell: createPercentageCell(),
				},
			] as ColumnDef<PageRowData, unknown>[],
			getFilter: (row: PageRowData) => ({
				field: 'path',
				value: row.name,
			}),
		},
		{
			id: 'page_time_analysis',
			label: 'Time Analysis',
			data: analytics.page_time_analysis || [],
			columns: pageTimeColumns as ColumnDef<PageRowData, unknown>[],
			getFilter: (row: PageRowData) => ({
				field: 'path',
				value: row.name,
			}),
		},
	];

	const deviceColumns = [
		{
			id: 'device_type',
			accessorKey: 'device_type',
			header: 'Device Type',
			cell: (info: CellInfo) => {
				const row = info.row.original as { name: string };
				return <DeviceTypeCell device_type={row.name} />;
			},
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: createPercentageCell(),
		},
	];

	const browserColumns = [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Browser',
			cell: createTechnologyCell('browser'),
			size: 180,
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Pageviews',
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: createPercentageCell(),
		},
	];

	const osColumns = [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Operating System',
			cell: createTechnologyCell('os'),
			size: 200,
		},
		{
			id: 'visitors',
			accessorKey: 'visitors',
			header: 'Visitors',
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'pageviews',
			accessorKey: 'pageviews',
			header: 'Pageviews',
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: 'percentage',
			accessorKey: 'percentage',
			header: 'Share',
			cell: createPercentageCell(),
		},
	];

	const userTimezone = getUserTimezone();
	dayjs.extend(utc);
	dayjs.extend(timezone);
	const todayDate = dayjs().tz(userTimezone).format('YYYY-MM-DD');
	const todayEvent = analytics.events_by_date.find(
		(event: MetricPoint) =>
			dayjs(event.date).tz(userTimezone).format('YYYY-MM-DD') === todayDate
	);
	const todayVisitors = todayEvent?.visitors ?? 0;
	const todaySessions = todayEvent?.sessions ?? 0;
	const todayPageviews = todayEvent?.pageviews ?? 0;

	const calculateTrends = (() => {
		const currentSummary = analytics.summary;
		const previousSummary = getDataForQuery(
			'overview-summary',
			'previous_summary_metrics'
		)?.[0];

		if (!(currentSummary && previousSummary)) {
			return {};
		}

		const currentMetrics = {
			visitors: currentSummary.unique_visitors || 0,
			sessions: currentSummary.sessions || 0,
			pageviews: currentSummary.pageviews || 0,
			bounceRate: currentSummary.bounce_rate || 0,
			sessionDuration: currentSummary.avg_session_duration || 0,
			pagesPerSession: 0,
		};
		currentMetrics.pagesPerSession =
			currentMetrics.sessions > 0
				? currentMetrics.pageviews / currentMetrics.sessions
				: 0;

		const previousMetrics = {
			visitors: previousSummary.unique_visitors || 0,
			sessions: previousSummary.sessions || 0,
			pageviews: previousSummary.pageviews || 0,
			bounceRate: previousSummary.bounce_rate || 0,
			sessionDuration: previousSummary.avg_session_duration || 0,
			pagesPerSession: 0,
		};
		previousMetrics.pagesPerSession =
			previousMetrics.sessions > 0
				? previousMetrics.pageviews / previousMetrics.sessions
				: 0;
		const calculateTrendPercentage = (
			current: number,
			previous: number,
			minimumBase = 0
		) => {
			if (previous < minimumBase && !(previous === 0 && current === 0)) {
				return;
			}
			if (previous === 0) {
				return current === 0 ? 0 : undefined;
			}
			const change = calculatePercentChange(current, previous);
			return Math.max(-100, Math.min(1000, Math.round(change)));
		};
		const canShowSessionBasedTrend =
			previousMetrics.sessions >= MIN_PREVIOUS_SESSIONS_FOR_TREND;

		const createDetailedTrend = (
			currentVal: number,
			previousVal: number,
			minimumBase = 0
		) => {
			const change = calculateTrendPercentage(
				currentVal,
				previousVal,
				minimumBase
			);
			if (change === undefined) {
				return change;
			}

			return {
				change,
				current: currentVal,
				previous: previousVal,
				currentPeriod: { start: dateRange.start_date, end: dateRange.end_date },
				previousPeriod: {
					start: previousPeriodRange.start_date,
					end: previousPeriodRange.end_date,
				},
			};
		};

		return {
			visitors: createDetailedTrend(
				currentMetrics.visitors,
				previousMetrics.visitors,
				MIN_PREVIOUS_VISITORS_FOR_TREND
			),
			sessions: createDetailedTrend(
				currentMetrics.sessions,
				previousMetrics.sessions,
				MIN_PREVIOUS_SESSIONS_FOR_TREND
			),
			pageviews: createDetailedTrend(
				currentMetrics.pageviews,
				previousMetrics.pageviews,
				MIN_PREVIOUS_PAGEVIEWS_FOR_TREND
			),
			pages_per_session: canShowSessionBasedTrend
				? createDetailedTrend(
						currentMetrics.pagesPerSession,
						previousMetrics.pagesPerSession
					)
				: undefined,
			bounce_rate: canShowSessionBasedTrend
				? createDetailedTrend(
						currentMetrics.bounceRate,
						previousMetrics.bounceRate
					)
				: undefined,
			session_duration: canShowSessionBasedTrend
				? createDetailedTrend(
						currentMetrics.sessionDuration,
						previousMetrics.sessionDuration
					)
				: undefined,
		};
	})();

	const onAddFilter = useCallback(
		(field: string, value: string) => {
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

	if (error instanceof Error && error.message === 'UNAUTHORIZED_ACCESS') {
		return <UnauthorizedAccessError />;
	}

	return (
		<div className="space-y-6">
			<EventLimitIndicator />
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6">
				{[
					{
						id: 'visitors-chart',
						title: 'UNIQUE VISITORS',
						value: analytics.summary?.unique_visitors || 0,
						description: `${todayVisitors} today`,
						icon: UsersIcon,
						chartData: miniChartData.visitors,
						trend: calculateTrends.visitors,
					},
					{
						id: 'sessions-chart',
						title: 'SESSIONS',
						value: analytics.summary?.sessions || 0,
						description: `${todaySessions} today`,
						icon: ChartLineIcon,
						chartData: miniChartData.sessions,
						trend: calculateTrends.sessions,
					},
					{
						id: 'pageviews-chart',
						title: 'PAGEVIEWS',
						value: analytics.summary?.pageviews || 0,
						description: `${todayPageviews} today`,
						icon: GlobeIcon,
						chartData: miniChartData.pageviews,
						trend: calculateTrends.pageviews,
					},
					{
						id: 'pages-per-session-chart',
						title: 'PAGES/SESSION',
						value: analytics.summary
							? analytics.summary.sessions > 0
								? (
										analytics.summary.pageviews / analytics.summary.sessions
									).toFixed(1)
								: '0'
							: '0',
						description: '',
						icon: LayoutIcon,
						chartData: miniChartData.pagesPerSession,
						trend: calculateTrends.pages_per_session,
						formatValue: (value: number) => value.toFixed(1),
					},
					{
						id: 'bounce-rate-chart',
						title: 'BOUNCE RATE',
						value: analytics.summary?.bounce_rate
							? `${analytics.summary.bounce_rate.toFixed(1)}%`
							: '0%',
						description: '',
						icon: CursorIcon,
						chartData: miniChartData.bounceRate,
						trend: calculateTrends.bounce_rate,
						formatValue: (value: number) => `${value.toFixed(1)}%`,
						invertTrend: true,
						variant: getColorVariant(
							analytics.summary?.bounce_rate || 0,
							70,
							50
						),
					},
					{
						id: 'session-duration-chart',
						title: 'SESSION DURATION',
						value: (() => {
							const duration = analytics.summary?.avg_session_duration;
							if (!duration) {
								return '0s';
							}
							if (duration < 60) {
								return `${duration.toFixed(1)}s`;
							}
							const minutes = Math.floor(duration / 60);
							const seconds = Math.round(duration % 60);
							return `${minutes}m ${seconds}s`;
						})(),
						description: '',
						icon: TimerIcon,
						chartData: miniChartData.sessionDuration,
						trend: calculateTrends.session_duration,
						formatValue: (value: number) => {
							if (value < 60) {
								return `${Math.round(value)}s`;
							}
							const minutes = Math.floor(value / 60);
							const seconds = Math.round(value % 60);
							return `${minutes}m ${seconds}s`;
						},
						formatChartValue: (value: number) => {
							if (value < 60) {
								return `${Math.round(value)}s`;
							}
							const minutes = Math.floor(value / 60);
							const seconds = Math.round(value % 60);
							return `${minutes}m ${seconds}s`;
						},
					},
				].map((metric) => (
					<StatCard
						chartData={isLoading ? undefined : metric.chartData}
						className="h-full"
						description={
							metric.description &&
							metric.id !== 'pages-per-session-chart' &&
							metric.id !== 'bounce-rate-chart' &&
							metric.id !== 'session-duration-chart'
								? formatNumber(Number(metric.description.split(' ')[0])) +
									' today'
								: metric.description
						}
						formatChartValue={metric.formatChartValue}
						formatValue={metric.formatValue}
						icon={metric.icon}
						id={metric.id}
						invertTrend={metric.invertTrend}
						isLoading={isLoading}
						key={metric.id}
						showChart={true}
						title={metric.title}
						trend={metric.trend}
						trendLabel={
							metric.trend !== undefined ? 'vs previous period' : undefined
						}
						value={
							typeof metric.value === 'number'
								? formatNumber(metric.value)
								: metric.value
						}
						variant={metric.variant || 'default'}
					/>
				))}
			</div>

			{/* Chart */}
			<div className="rounded border border-sidebar-border border-b-0 bg-sidebar shadow-sm">
				<div className="flex flex-col items-start justify-between gap-3 border-sidebar-border border-b px-4 py-3 sm:flex-row">
					<div>
						<h2 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
							Traffic Trends
						</h2>
						<p className="text-sidebar-foreground/70 text-sm">
							{dateRange.granularity === 'hourly' ? 'Hourly' : 'Daily'} traffic
							data
						</p>
						{dateRange.granularity === 'hourly' && dateDiff > 7 && (
							<div className="mt-1 flex items-center gap-1 text-amber-600 text-xs">
								<WarningIcon size={16} weight="fill" />
								<span>Large date ranges may affect performance</span>
							</div>
						)}
					</div>

					<div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
						{/* Live user indicator moved to analytics toolbar */}
					</div>
				</div>
				<div>
					<MetricsChart
						className="rounded border-0"
						data={chartData}
						height={350}
						hiddenMetrics={hiddenMetrics}
						isLoading={isLoading}
						onToggleMetric={toggleMetric}
					/>
				</div>
			</div>

			{/* Tables */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<DataTable
					description="Referrers and campaign data"
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={referrerTabs}
					title="Traffic Sources"
				/>

				<DataTable
					description="Top pages and entry/exit points"
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={pagesTabs}
					title="Pages"
				/>
			</div>

			{/* Custom Events Table */}
			<CustomEventsSection
				customEventsData={customEventsData}
				isLoading={isLoading}
				onAddFilter={onAddFilter}
			/>

			{/* Technology */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<DataTable
					columns={deviceColumns}
					data={analytics.device_types || []}
					description="Device breakdown"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					showSearch={false}
					tabs={[
						{
							id: 'devices',
							label: 'Devices',
							data: analytics.device_types || [],
							columns: deviceColumns,
							getFilter: (row: TechnologyData) => {
								const deviceDisplayToFilterMap: Record<string, string> = {
									laptop: 'mobile',
									tablet: 'tablet',
									desktop: 'desktop',
								};
								return {
									field: 'device_type',
									value: deviceDisplayToFilterMap[row.name] || row.name,
								};
							},
						},
					]}
					title="Devices"
				/>

				<DataTable
					columns={browserColumns}
					data={analytics.browser_versions || []}
					description="Browser breakdown"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					showSearch={false}
					tabs={[
						{
							id: 'browsers',
							label: 'Browsers',
							data: analytics.browser_versions || [],
							columns: browserColumns,
							getFilter: (row: TechnologyData) => ({
								field: 'browser_name',
								value: row.name,
							}),
						},
					]}
					title="Browsers"
				/>

				<DataTable
					columns={osColumns}
					data={analytics.operating_systems || []}
					description="OS breakdown"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					showSearch={false}
					tabs={[
						{
							id: 'operating_systems',
							label: 'Operating Systems',
							data: analytics.operating_systems || [],
							columns: osColumns,
							getFilter: (row: TechnologyData) => ({
								field: 'os_name',
								value: row.name,
							}),
						},
					]}
					title="Operating Systems"
				/>
			</div>
		</div>
	);
}
