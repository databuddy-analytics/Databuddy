'use client';

import {
	CaretDownIcon,
	CaretRightIcon,
	ChartLineIcon,
	CursorIcon,
	GlobeIcon,
	LayoutIcon,
	TimerIcon,
	UsersIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { useAtom } from 'jotai';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	DataTable,
	DeviceTypeCell,
	EventLimitIndicator,
	LiveUserIndicator,
	StatCard,
	UnauthorizedAccessError,
} from '@/components/analytics';
import {
	ReferrerSourceCell,
	type ReferrerSourceCellData,
} from '@/components/atomic/ReferrerSourceCell';
import { MetricsChart } from '@/components/charts/metrics-chart';

import { useBatchDynamicQuery } from '@/hooks/use-dynamic-query';
import { useTableTabs } from '@/lib/table-tabs';
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
import {
	getBrowserIcon,
	getOSIcon,
	PercentageBadge,
	TechnologyIcon,
} from '../utils/technology-helpers';
import type { FullTabProps, MetricPoint } from '../utils/types';
import { MetricToggles } from '../utils/ui-components';

interface ChartDataPoint {
	date: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	avg_session_duration?: number;
	[key: string]: unknown;
}

interface PageData {
	name: string;
	visitors: number;
	pageviews?: number;
	percentage: number;
}

interface TechnologyData {
	name: string;
	visitors: number;
	pageviews?: number;
	percentage: number;
	icon?: string;
	category?: string;
}

interface CustomEventData {
	name: string;
	total_events: number;
	unique_users: number;
	percentage: number;
	last_occurrence?: string;
	first_occurrence?: string;
	propertyCategories?: PropertyCategory[];
}

interface PropertyCategory {
	key: string;
	total: number;
	values: PropertyValue[];
}

interface PropertyValue {
	value: string;
	count: number;
	percentage: number;
	percentage_within_event: number;
	unique_users: number;
	unique_sessions: number;
}

interface CellInfo {
	getValue: () => unknown;
	row: { original: unknown };
}

interface EventProperty {
	name: string;
	property_key: string;
	property_value: string;
	count: number;
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
		pages: ['top_pages', 'entry_pages', 'exit_pages'] as string[],
		traffic: [
			'top_referrers',
			'utm_sources',
			'utm_mediums',
			'utm_campaigns',
		] as string[],
		tech: ['device_types', 'browsers', 'operating_systems'] as string[], // <-- add 'operating_systems' here
		customEvents: ['custom_events', 'custom_event_properties'] as string[],
	},
} as const;

export function WebsiteOverviewTab({
	websiteId,
	dateRange,
	isRefreshing,
	setIsRefreshing,
	filters,
	addFilter,
}: FullTabProps) {
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

	const {
		isLoading: batchLoading,
		error: batchError,
		refetch: refetchBatch,
		getDataForQuery,
	} = useBatchDynamicQuery(websiteId, dateRange, queries);

	const analytics = {
		summary:
			getDataForQuery('overview-summary', 'summary_metrics')?.[0] || null,
		today: getDataForQuery('overview-summary', 'today_metrics')?.[0] || null,
		events_by_date: getDataForQuery('overview-summary', 'events_by_date') || [],
		top_pages: getDataForQuery('overview-pages', 'top_pages') || [],
		entry_pages: getDataForQuery('overview-pages', 'entry_pages') || [],
		exit_pages: getDataForQuery('overview-pages', 'exit_pages') || [],
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
	};

	const loading = {
		summary: batchLoading || isRefreshing,
	};

	const error = batchError;

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

	const metricsForToggles = {
		pageviews: visibleMetrics.pageviews,
		visitors: visibleMetrics.visitors,
		sessions: visibleMetrics.sessions,
		bounce_rate: visibleMetrics.bounce_rate,
		avg_session_duration: visibleMetrics.avg_session_duration,
	};

	useEffect(() => {
		if (isRefreshing) {
			const doRefresh = async () => {
				try {
					await refetchBatch();
				} catch {
					// Handle error silently or use proper error reporting
				} finally {
					setIsRefreshing(false);
				}
			};
			doRefresh();
		}
	}, [isRefreshing, refetchBatch, setIsRefreshing]);

	const isLoading = loading.summary || isRefreshing;

	const [expandedProperties, setExpandedProperties] = useState<Set<string>>(
		new Set()
	);

	const referrerCustomCell = (info: CellInfo) => {
		const cellData = info.row.original as ReferrerSourceCellData;
		return <ReferrerSourceCell {...cellData} />;
	};

	const referrerTabs = useTableTabs({
		referrers: {
			data: analytics.top_referrers || [],
			label: 'Referrers',
			primaryField: 'name',
			primaryHeader: 'Source',
			customCell: referrerCustomCell,
			getFilter: (row: any) => {
				// For referrers, use the referrer field and get the actual referrer URL
				return {
					field: 'referrer',
					value: row.referrer,
				};
			},
		},
		utm_sources: {
			data: analytics.utm_sources || [],
			label: 'UTM Sources',
			primaryField: 'name',
			primaryHeader: 'Source',
			getFilter: (row: any) => ({
				field: 'utm_source',
				value: row.name,
			}),
		},
		utm_mediums: {
			data: analytics.utm_mediums || [],
			label: 'UTM Mediums',
			primaryField: 'name',
			primaryHeader: 'Medium',
			getFilter: (row: any) => ({
				field: 'utm_medium',
				value: row.name,
			}),
		},
		utm_campaigns: {
			data: analytics.utm_campaigns || [],
			label: 'UTM Campaigns',
			primaryField: 'name',
			primaryHeader: 'Campaign',
			getFilter: (row: any) => ({
				field: 'utm_campaign',
				value: row.name,
			}),
		},
	});

	const pagesTabs = useTableTabs({
		top_pages: {
			data: analytics.top_pages || [],
			label: 'Top Pages',
			primaryField: 'name',
			primaryHeader: 'Page',
			getFilter: (row: any) => ({
				field: 'path',
				value: row.name,
			}),
		},
		entry_pages: {
			data: analytics.entry_pages || [],
			label: 'Entry Pages',
			primaryField: 'name',
			primaryHeader: 'Page',
			getFilter: (row: any) => ({
				field: 'path',
				value: row.name,
			}),
		},
		exit_pages: {
			data: analytics.exit_pages || [],
			label: 'Exit Pages',
			primaryField: 'name',
			primaryHeader: 'Page',
			getFilter: (row: any) => ({
				field: 'path',
				value: row.name,
			}),
		},
	});

	const metricColors = {
		pageviews: 'blue-500',
		visitors: 'green-500',
		sessions: 'purple-500',
		bounce_rate: 'amber-500',
		avg_session_duration: 'red-500',
	};
	const dateFrom = dayjs(dateRange.start_date);
	const dateTo = dayjs(dateRange.end_date);
	const dateDiff = dateTo.diff(dateFrom, 'day');

	const filterFutureEvents = (events: MetricPoint[]) => {
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
	};

	const chartData = (() => {
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
	})();

	const miniChartData = (() => {
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
	})();

	const processedDeviceData = (() => {
		const deviceData = analytics.device_types || [];
		return deviceData.map(
			(item: { name: string; visitors: number; percentage: number }) => ({
				name: item.name,
				visitors: item.visitors,
				percentage: item.percentage,
			})
		);
	})();

	const processedBrowserData = (() => {
		const browserData = analytics.browser_versions || [];
		return browserData.map((item: TechnologyData) => ({
			name: item.name,
			visitors: item.visitors,
			pageviews: item.pageviews,
			percentage: item.percentage ?? 0,
			icon: getBrowserIcon(item.name),
			category: 'browser',
		}));
	})();

	const processedOSData = (analytics.operating_systems || []).map(
		(item: TechnologyData) => ({
			name: item.name,
			visitors: item.visitors,
			pageviews: item.pageviews,
			percentage: item.percentage ?? 0,
			icon: getOSIcon(item.name),
			category: 'os',
		})
	);

	const togglePropertyExpansion = (propertyId: string) => {
		const newExpanded = new Set(expandedProperties);
		if (newExpanded.has(propertyId)) {
			newExpanded.delete(propertyId);
		} else {
			newExpanded.add(propertyId);
		}
		setExpandedProperties(newExpanded);
	};

	const processedCustomEventsData = (() => {
		if (!customEventsData?.custom_events?.length) {
			return [];
		}
		const customEvents = customEventsData.custom_events;
		const propertiesData = customEventsData.custom_event_properties || [];

		return customEvents.map((event: CustomEventData) => {
			// Find properties for this event
			const eventProperties = propertiesData.filter(
				(prop: EventProperty) => prop.name === event.name
			);

			// Group properties by key and aggregate values
			const propertyCategories: PropertyCategory[] = [];
			const propertyMap = new Map<
				string,
				Map<
					string,
					{
						count: number;
					}
				>
			>();

			for (const prop of eventProperties) {
				// Data is already pre-aggregated from API with percentages
				const key = prop.property_key;
				const value = prop.property_value;
				const data = {
					count: prop.count,
				};

				if (!propertyMap.has(key)) {
					propertyMap.set(key, new Map());
				}

				const valueMap = propertyMap.get(key);
				if (valueMap) {
					valueMap.set(value, data);
				}
			}

			// Convert to array format for display - use pre-computed percentages
			for (const [key, valueMap] of propertyMap.entries()) {
				const values = Array.from(valueMap.entries()).map(([value, data]) => ({
					value,
					count: data.count,
				}));

				const total = values.reduce((sum, item) => sum + item.count, 0);

				propertyCategories.push({
					key,
					total,
					values: values.sort((a, b) => b.count - a.count) as PropertyValue[],
				});
			}

			return {
				...event,
				percentage: event.percentage || 0,
				last_occurrence_formatted: event.last_occurrence
					? new Date(event.last_occurrence).toLocaleDateString()
					: 'N/A',
				first_occurrence_formatted: event.first_occurrence
					? new Date(event.first_occurrence).toLocaleDateString()
					: 'N/A',
				propertyCategories: propertyCategories.sort(
					(a, b) => b.total - a.total
				),
			};
		});
	})();

	const createTechnologyCell = () => (info: CellInfo) => {
		const entry = info.row.original as TechnologyData;
		return (
			<div className="flex items-center gap-3">
				<TechnologyIcon entry={entry} size="md" />
				<span className="font-medium">{entry.name}</span>
			</div>
		);
	};

	const createPercentageCell = () => (info: CellInfo) => {
		const percentage = info.getValue() as number;
		return <PercentageBadge percentage={percentage} />;
	};

	const formatNumber = (value: number | null | undefined): string => {
		if (value == null || Number.isNaN(value)) {
			return '0';
		}
		return Intl.NumberFormat(undefined, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	};

	const createMetricCell = (label: string) => (info: CellInfo) => (
		<div>
			<div className="font-medium text-foreground">
				{formatNumber(info.getValue() as number)}
			</div>
			<div className="text-muted-foreground text-xs">{label}</div>
		</div>
	);

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
			cell: createTechnologyCell(),
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
			cell: createTechnologyCell(),
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

	const customEventsColumns = [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'Event Name',
			cell: (info: CellInfo) => {
				const eventName = info.getValue() as string;
				return (
					<div className="flex items-center gap-3">
						<div className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
						<span className="font-medium text-foreground">{eventName}</span>
					</div>
				);
			},
		},
		{
			id: 'total_events',
			accessorKey: 'total_events',
			header: 'Events',
			cell: createMetricCell('total'),
		},
		{
			id: 'unique_users',
			accessorKey: 'unique_users',
			header: 'Users',
			cell: createMetricCell('unique'),
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

	if (error instanceof Error && error.message === 'UNAUTHORIZED_ACCESS') {
		return <UnauthorizedAccessError />;
	}

	const onAddFilter = useCallback(
		(field: string, value: string, tableTitle?: string) => {
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

	return (
		<div className="space-y-6 pt-6">
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
			<div className="rounded border bg-card shadow-sm">
				<div className="flex flex-col items-start justify-between gap-3 border-b p-4 sm:flex-row">
					<div>
						<h2 className="font-semibold text-lg tracking-tight">
							Traffic Trends
						</h2>
						<p className="text-muted-foreground text-sm">
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
						<LiveUserIndicator websiteId={websiteId} />
						<MetricToggles
							colors={metricColors}
							labels={{
								pageviews: 'Views',
								visitors: 'Visitors',
								sessions: 'Sessions',
								bounce_rate: 'Bounce',
								avg_session_duration: 'Duration',
							}}
							metrics={metricsForToggles}
							onToggle={toggleMetric}
						/>
					</div>
				</div>
				<div>
					<MetricsChart data={chartData} height={350} isLoading={isLoading} />
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
			<DataTable
				columns={customEventsColumns}
				data={processedCustomEventsData}
				description="User-defined events and interactions with property breakdowns"
				emptyMessage="No custom events tracked yet"
				expandable={true}
				getSubRows={(row: CustomEventData) =>
					row.propertyCategories as unknown as CustomEventData[]
				}
				initialPageSize={8}
				isLoading={isLoading}
				minHeight={350}
				onAddFilter={onAddFilter}
				renderSubRow={(subRow: CustomEventData, parentRow: CustomEventData) => {
					const typedSubRow = subRow as unknown as PropertyCategory;
					const propertyKey = typedSubRow.key;
					const propertyTotal = typedSubRow.total;
					const propertyValues = typedSubRow.values;
					const propertyId = `${parentRow.name}-${propertyKey}`;
					const isPropertyExpanded = expandedProperties.has(propertyId);

					return (
						<div className="ml-4">
							<button
								className="flex w-full items-center justify-between rounded border border-border/30 bg-muted/20 px-3 py-2 hover:bg-muted/40"
								onClick={() => togglePropertyExpansion(propertyId)}
								type="button"
							>
								<div className="flex items-center gap-2">
									{isPropertyExpanded ? (
										<CaretDownIcon
											className="h-3 w-3 text-muted-foreground"
											size={16}
											weight="fill"
										/>
									) : (
										<CaretRightIcon
											className="h-3 w-3 text-muted-foreground"
											size={16}
											weight="fill"
										/>
									)}
									<span className="font-medium text-foreground text-sm">
										{propertyKey}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<div className="font-medium text-foreground text-sm">
										{formatNumber(propertyTotal)}
									</div>
									<div className="rounded bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
										{propertyValues.length}{' '}
										{propertyValues.length === 1 ? 'value' : 'values'}
									</div>
								</div>
							</button>

							{isPropertyExpanded && (
								<div className="mt-1 max-h-48 overflow-y-auto rounded border border-border/20">
									{propertyValues.map(
										(valueItem: PropertyValue, valueIndex: number) => (
											<div
												className="flex items-center justify-between border-border/10 border-b px-3 py-2 last:border-b-0 hover:bg-muted/20"
												key={`${propertyKey}-${valueItem.value}-${valueIndex}`}
											>
												<span
													className="truncate font-mono text-foreground text-sm"
													title={valueItem.value}
												>
													{valueItem.value}
												</span>
												<div className="flex items-center gap-2">
													<span className="font-medium text-foreground text-sm">
														{formatNumber(valueItem.count)}
													</span>
													<div className="min-w-[2.5rem] rounded bg-muted px-2 py-0.5 text-center font-medium text-muted-foreground text-xs">
														{valueItem.percentage}%
													</div>
												</div>
											</div>
										)
									)}
								</div>
							)}
						</div>
					);
				}}
				title="Custom Events"
			/>

			{/* Technology */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				<DataTable
					columns={deviceColumns}
					data={processedDeviceData}
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
							data: processedDeviceData,
							columns: deviceColumns,
							getFilter: (row: any) => {
								// Map display device names to filter values
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
					data={processedBrowserData}
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
							data: processedBrowserData,
							columns: browserColumns,
							getFilter: (row: any) => ({
								field: 'browser_name',
								value: row.name,
							}),
						},
					]}
					title="Browsers"
				/>

				<DataTable
					columns={osColumns}
					data={processedOSData}
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
							data: processedOSData,
							columns: osColumns,
							getFilter: (row: any) => ({
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
