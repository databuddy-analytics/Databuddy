"use client";

import {
	ChartLineIcon,
	CursorIcon,
	GlobeIcon,
	TimerIcon,
	UsersIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import type { ColumnDef } from "@tanstack/react-table";
import dayjs from "dayjs";
import { useAtom } from "jotai";
import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import {
	DeviceTypeCell,
	EventLimitIndicator,
	StatCard,
	UnauthorizedAccessError,
} from "@/components/analytics";
import { MetricsChartWithAnnotations } from "@/components/charts/metrics-chart-with-annotations";
import { BrowserIcon, OSIcon } from "@/components/icon";
import { DataTable } from "@/components/table/data-table";
import {
	createMetricColumns,
	createPageColumns,
	createPageTimeColumns,
	createReferrerColumns,
} from "@/components/table/rows";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { useMediaQuery } from "@/hooks/use-media-query";
import { metricVisibilityAtom } from "@/stores/jotai/chartAtoms";
import {
	calculatePercentChange,
	formatDateByGranularity,
} from "../utils/analytics-helpers";
import { PercentageBadge } from "../utils/technology-helpers";
import type { FullTabProps, MetricPoint } from "../utils/types";

const CustomEventsSection = dynamic(() =>
	import("./overview/_components/custom-events-section").then((mod) => ({
		default: mod.CustomEventsSection,
	}))
);

const GeoMapSection = dynamic(() =>
	import("./overview/_components/geo-map-section").then((mod) => ({
		default: mod.GeoMapSection,
	}))
);

interface ChartDataPoint {
	date: string;
	rawDate?: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	median_session_duration?: number;
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

interface PageRowData {
	name: string;
	visitors: number;
	pageviews: number;
	percentage: number;
}

interface AnalyticsRowData {
	name: string;
	visitors: number;
	pageviews: number;
	percentage: number;
	referrer?: string;
}

const MIN_PREVIOUS_SESSIONS_FOR_TREND = 5;
const MIN_PREVIOUS_VISITORS_FOR_TREND = 5;
const MIN_PREVIOUS_PAGEVIEWS_FOR_TREND = 10;

// Configuration
const QUERY_CONFIG = {
	limit: 100,
	parameters: {
		summary: ["summary_metrics", "today_metrics", "events_by_date"] as string[],
		pages: [
			"top_pages",
			"entry_pages",
			"exit_pages",
			"page_time_analysis",
		] as string[],
		traffic: [
			"top_referrers",
			"utm_sources",
			"utm_mediums",
			"utm_campaigns",
		] as string[],
		tech: ["device_types", "browsers", "operating_systems"] as string[],
		customEvents: [
			"custom_events",
			"custom_event_properties",
			"outbound_links",
			"outbound_domains",
		] as string[],
		geo: ["country"] as string[],
	},
} as const;

export function WebsiteOverviewTab({
	websiteId,
	dateRange,
	filters,
	addFilter,
}: Omit<FullTabProps, "isRefreshing" | "setIsRefreshing">) {
	const { chartType, chartStepType } = useChartPreferences("overview-stats");
	const isMobile = useMediaQuery("(max-width: 640px)");
	const calculatePreviousPeriod = useCallback(
		(currentRange: typeof dateRange) => {
			const startDate = dayjs(currentRange.start_date);
			const daysDiff = dayjs(currentRange.end_date).diff(startDate, "day");

			return {
				start_date: startDate
					.subtract(daysDiff + 1, "day")
					.format("YYYY-MM-DD"),
				end_date: startDate.subtract(1, "day").format("YYYY-MM-DD"),
				granularity: currentRange.granularity,
			};
		},
		[]
	);

	const { setDateRangeAction } = useDateFilters();

	const previousPeriodRange = useMemo(
		() => calculatePreviousPeriod(dateRange),
		[dateRange, calculatePreviousPeriod]
	);

	const [visibleMetrics] = useAtom(metricVisibilityAtom);

	const queries = [
		{
			id: "overview-summary",
			parameters: [
				"summary_metrics",
				"today_metrics",
				"events_by_date",
				{
					name: "summary_metrics",
					start_date: previousPeriodRange.start_date,
					end_date: previousPeriodRange.end_date,
					granularity: previousPeriodRange.granularity,
					id: "previous_summary_metrics",
				},
				{
					name: "events_by_date",
					start_date: previousPeriodRange.start_date,
					end_date: previousPeriodRange.end_date,
					granularity: previousPeriodRange.granularity,
					id: "previous_events_by_date",
				},
			],
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: "overview-pages",
			parameters: QUERY_CONFIG.parameters.pages,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: "overview-traffic",
			parameters: QUERY_CONFIG.parameters.traffic,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: "overview-tech",
			parameters: QUERY_CONFIG.parameters.tech,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: "overview-custom-events",
			parameters: QUERY_CONFIG.parameters.customEvents,
			limit: QUERY_CONFIG.limit,
			granularity: dateRange.granularity,
			filters,
		},
		{
			id: "overview-geo",
			parameters: QUERY_CONFIG.parameters.geo,
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
			getDataForQuery("overview-summary", "summary_metrics")?.[0] || null,
		today: getDataForQuery("overview-summary", "today_metrics")?.[0] || null,
		events_by_date: getDataForQuery("overview-summary", "events_by_date") || [],
		top_pages: getDataForQuery("overview-pages", "top_pages") || [],
		entry_pages: getDataForQuery("overview-pages", "entry_pages") || [],
		exit_pages: getDataForQuery("overview-pages", "exit_pages") || [],
		page_time_analysis:
			getDataForQuery("overview-pages", "page_time_analysis") || [],
		top_referrers: getDataForQuery("overview-traffic", "top_referrers") || [],
		utm_sources: getDataForQuery("overview-traffic", "utm_sources") || [],
		utm_mediums: getDataForQuery("overview-traffic", "utm_mediums") || [],
		utm_campaigns: getDataForQuery("overview-traffic", "utm_campaigns") || [],
		device_types: getDataForQuery("overview-tech", "device_types") || [],
		browser_versions: getDataForQuery("overview-tech", "browsers") || [],
		operating_systems:
			getDataForQuery("overview-tech", "operating_systems") || [],
	};

	const customEventsData = {
		custom_events:
			getDataForQuery("overview-custom-events", "custom_events") || [],
		custom_event_properties:
			getDataForQuery("overview-custom-events", "custom_event_properties") ||
			[],
		outbound_links:
			getDataForQuery("overview-custom-events", "outbound_links") || [],
		outbound_domains:
			getDataForQuery("overview-custom-events", "outbound_domains") || [],
	};

	const geoData = {
		countries: getDataForQuery("overview-geo", "country") || [],
	};

	const createPercentageCell = () => (info: CellInfo) => {
		const percentage = info.getValue() as number;
		return <PercentageBadge percentage={percentage} />;
	};

	const referrerTabs = [
		{
			id: "referrers",
			label: "Referrers",
			data: analytics.top_referrers || [],
			columns: createReferrerColumns() as ColumnDef<
				AnalyticsRowData,
				unknown
			>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: "referrer",
				value: row.referrer || "",
			}),
		},
		{
			id: "utm_sources",
			label: "UTM Sources",
			data: analytics.utm_sources || [],
			columns: createMetricColumns({
				includeName: true,
				nameLabel: "Source",
				visitorsLabel: "Visitors",
				pageviewsLabel: "Views",
			}) as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: "utm_source",
				value: row.name,
			}),
		},
		{
			id: "utm_mediums",
			label: "UTM Mediums",
			data: analytics.utm_mediums || [],
			columns: createMetricColumns({
				includeName: true,
				nameLabel: "Medium",
				visitorsLabel: "Visitors",
				pageviewsLabel: "Views",
			}) as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: "utm_medium",
				value: row.name,
			}),
		},
		{
			id: "utm_campaigns",
			label: "UTM Campaigns",
			data: analytics.utm_campaigns || [],
			columns: createMetricColumns({
				includeName: true,
				nameLabel: "Campaign",
				visitorsLabel: "Visitors",
				pageviewsLabel: "Views",
			}) as ColumnDef<AnalyticsRowData, unknown>[],
			getFilter: (row: AnalyticsRowData) => ({
				field: "utm_campaign",
				value: row.name,
			}),
		},
	];

	const dateFrom = dayjs(dateRange.start_date);
	const dateTo = dayjs(dateRange.end_date);
	const dateDiff = dateTo.diff(dateFrom, "day");

	const processedEventsData = useMemo(() => {
		if (!analytics.events_by_date?.length) {
			return [];
		}

		const now = dayjs();
		const isHourly = dateRange.granularity === "hourly";

		const filteredEvents = analytics.events_by_date.filter(
			(event: MetricPoint) => {
				const eventDate = dayjs(event.date);

				if (isHourly) {
					return eventDate.isBefore(now);
				}

				const endOfToday = now.endOf("day");
				return (
					eventDate.isBefore(endOfToday) || eventDate.isSame(endOfToday, "day")
				);
			}
		);

		// Step 2: Create lookup map
		const dataMap = new Map<string, MetricPoint>();
		for (const item of filteredEvents) {
			const key = isHourly ? item.date : item.date.slice(0, 10);
			dataMap.set(key, item);
		}

		// Step 3: Fill missing dates
		const startDate = dayjs(dateRange.start_date);
		const endDate = dayjs(dateRange.end_date);
		const filled: MetricPoint[] = [];
		let current = startDate;

		while (current.isBefore(endDate) || current.isSame(endDate, "day")) {
			if (isHourly) {
				for (let hour = 0; hour < 24; hour++) {
					const hourDate = current.hour(hour);
					if (hourDate.isAfter(now)) {
						break;
					}

					const key = hourDate.format("YYYY-MM-DD HH:00:00");
					const existing = dataMap.get(key);

					filled.push(
						existing || {
							date: key,
							pageviews: 0,
							visitors: 0,
							unique_visitors: 0,
							sessions: 0,
							bounce_rate: 0,
							median_session_duration: 0,
							pages_per_session: 0,
						}
					);
				}
				current = current.add(1, "day");
				if (current.isAfter(endDate, "day")) {
					break;
				}
			} else {
				const key = current.format("YYYY-MM-DD");
				const existing = dataMap.get(key);

				filled.push(
					existing || {
						date: key,
						pageviews: 0,
						visitors: 0,
						unique_visitors: 0,
						sessions: 0,
						bounce_rate: 0,
						median_session_duration: 0,
						pages_per_session: 0,
					}
				);

				current = current.add(1, "day");
			}
		}

		return filled;
	}, [
		analytics.events_by_date,
		dateRange.start_date,
		dateRange.end_date,
		dateRange.granularity,
	]);

	const chartData = useMemo(
		() =>
			processedEventsData.map(
				(event: MetricPoint): ChartDataPoint => ({
					date: formatDateByGranularity(event.date, dateRange.granularity),
					rawDate: event.date,
					...(visibleMetrics.pageviews && {
						pageviews: event.pageviews as number,
					}),
					...(visibleMetrics.sessions && {
						sessions: event.sessions as number,
					}),
					...(visibleMetrics.visitors && {
						visitors:
							(event.visitors as number) ||
							(event.unique_visitors as number) ||
							0,
					}),
					...(visibleMetrics.bounce_rate && {
						bounce_rate: event.bounce_rate as number,
					}),
					...(visibleMetrics.median_session_duration && {
						median_session_duration: event.median_session_duration as number,
					}),
				})
			),
		[processedEventsData, dateRange.granularity, visibleMetrics]
	);

	const miniChartData = useMemo(() => {
		const createChartSeries = (
			field: keyof MetricPoint,
			transform?: (value: number) => number
		) =>
			processedEventsData.map((event: MetricPoint) => ({
				date:
					dateRange.granularity === "hourly"
						? event.date
						: event.date.slice(0, 10),
				value: transform
					? transform(Number(event[field]))
					: (event[field] as number) || 0,
			}));

		const formatSessionDuration = (value: number) => {
			if (value < 60) {
				return Math.round(value);
			}
			const minutes = Math.floor(value / 60);
			const seconds = Math.round(value % 60);
			return minutes * 60 + seconds;
		};

		return {
			visitors: createChartSeries("visitors"),
			sessions: createChartSeries("sessions"),
			pageviews: createChartSeries("pageviews"),
			pagesPerSession: createChartSeries("pages_per_session"),
			bounceRate: createChartSeries("bounce_rate"),
			sessionDuration: createChartSeries(
				"median_session_duration",
				formatSessionDuration
			),
		};
	}, [processedEventsData, dateRange.granularity]);

	const createTechnologyCell = (type: "browser" | "os") => (info: CellInfo) => {
		const entry = info.row.original as TechnologyData;
		const IconComponent = type === "browser" ? BrowserIcon : OSIcon;
		return (
			<div className="flex items-center gap-2 sm:gap-3">
				<IconComponent className="shrink-0" name={entry.name} size="md" />
				<span className="truncate font-medium text-sm sm:text-base">
					{entry.name}
				</span>
			</div>
		);
	};

	const formatNumber = useCallback(
		(value: number | null | undefined): string => {
			if (value === null || value === undefined || Number.isNaN(value)) {
				return "0";
			}
			return Intl.NumberFormat(undefined, {
				notation: "compact",
				maximumFractionDigits: 1,
			}).format(value);
		},
		[]
	);

	const pagesTabs = useMemo(
		() => [
			{
				id: "top_pages",
				label: "Top Pages",
				data: analytics.top_pages || [],
				columns: createPageColumns() as ColumnDef<PageRowData, unknown>[],
				getFilter: (row: PageRowData) => ({
					field: "path",
					value: row.name,
				}),
			},
			{
				id: "entry_pages",
				label: "Entry Pages",
				data: analytics.entry_pages || [],
				columns: createPageColumns() as ColumnDef<PageRowData, unknown>[],
				getFilter: (row: PageRowData) => ({
					field: "path",
					value: row.name,
				}),
			},
			{
				id: "exit_pages",
				label: "Exit Pages",
				data: analytics.exit_pages || [],
				columns: createPageColumns() as ColumnDef<PageRowData, unknown>[],
				getFilter: (row: PageRowData) => ({
					field: "path",
					value: row.name,
				}),
			},
			{
				id: "page_time_analysis",
				label: "Time Analysis",
				data: analytics.page_time_analysis || [],
				columns: createPageTimeColumns(),
				getFilter: (row: any) => ({
					field: "path",
					value: row.name,
				}),
			},
		],
		[
			analytics.top_pages,
			analytics.entry_pages,
			analytics.exit_pages,
			analytics.page_time_analysis,
		]
	);

	const deviceColumns = [
		{
			id: "device_type",
			accessorKey: "device_type",
			header: "Device Type",
			cell: (info: CellInfo) => {
				const row = info.row.original as { name: string };
				return <DeviceTypeCell device_type={row.name} />;
			},
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: createPercentageCell(),
		},
	];

	const browserColumns = [
		{
			id: "name",
			accessorKey: "name",
			header: "Browser",
			cell: createTechnologyCell("browser"),
			size: 180,
			minSize: 120,
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Pageviews",
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: createPercentageCell(),
		},
	];

	const osColumns = [
		{
			id: "name",
			accessorKey: "name",
			header: "Operating System",
			cell: createTechnologyCell("os"),
			size: 200,
			minSize: 140,
		},
		{
			id: "visitors",
			accessorKey: "visitors",
			header: "Visitors",
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "pageviews",
			accessorKey: "pageviews",
			header: "Pageviews",
			cell: (info: CellInfo) => (
				<span className="font-medium">
					{formatNumber(info.getValue() as number)}
				</span>
			),
		},
		{
			id: "percentage",
			accessorKey: "percentage",
			header: "Share",
			cell: createPercentageCell(),
		},
	];

	const todayDate = dayjs().format("YYYY-MM-DD");
	const todayEvent = analytics.events_by_date.find(
		(event: MetricPoint) => dayjs(event.date).format("YYYY-MM-DD") === todayDate
	);
	const todayVisitors = todayEvent?.visitors ?? 0;
	const todaySessions = todayEvent?.sessions ?? 0;
	const todayPageviews = todayEvent?.pageviews ?? 0;

	const calculateTrends = (() => {
		const currentSummary = analytics.summary;
		const previousSummary = getDataForQuery(
			"overview-summary",
			"previous_summary_metrics"
		)?.[0];

		if (!(currentSummary && previousSummary)) {
			return {};
		}

		const currentMetrics = {
			visitors: currentSummary.unique_visitors || 0,
			sessions: currentSummary.sessions || 0,
			pageviews: currentSummary.pageviews || 0,
			bounceRate: currentSummary.bounce_rate || 0,
			sessionDuration: currentSummary.median_session_duration || 0,
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
			sessionDuration: previousSummary.median_session_duration || 0,
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
				operator: "eq" as const,
				value,
			};

			addFilter(filter);
		},
		[addFilter]
	);

	if (error instanceof Error && error.message === "UNAUTHORIZED_ACCESS") {
		return <UnauthorizedAccessError />;
	}

	return (
		<div className="space-y-3 sm:space-y-4">
			<EventLimitIndicator />
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
				{[
					{
						id: "pageviews-chart",
						title: "Pageviews",
						value: analytics.summary?.pageviews || 0,
						description: `${formatNumber(todayPageviews)} today`,
						icon: GlobeIcon,
						chartData: miniChartData.pageviews,
						trend: calculateTrends.pageviews,
					},
					{
						id: "sessions-chart",
						title: "Sessions",
						value: analytics.summary?.sessions || 0,
						description: `${formatNumber(todaySessions)} today`,
						icon: ChartLineIcon,
						chartData: miniChartData.sessions,
						trend: calculateTrends.sessions,
					},
					{
						id: "visitors-chart",
						title: "Visitors",
						value: analytics.summary?.unique_visitors || 0,
						description: `${formatNumber(todayVisitors)} today`,
						icon: UsersIcon,
						chartData: miniChartData.visitors,
						trend: calculateTrends.visitors,
					},
					{
						id: "bounce-rate-chart",
						title: "Bounce Rate",
						value: analytics.summary?.bounce_rate
							? `${analytics.summary.bounce_rate.toFixed(1)}%`
							: "0%",
						icon: CursorIcon,
						chartData: miniChartData.bounceRate,
						trend: calculateTrends.bounce_rate,
						invertTrend: true,
						formatValue: (value: number) => `${value.toFixed(1)}%`,
					},
					{
						id: "session-duration-chart",
						title: "Session Duration",
						value: (() => {
							const duration = analytics.summary?.median_session_duration;
							if (!duration) {
								return "0s";
							}
							if (duration < 60) {
								return `${Math.round(duration)}s`;
							}
							const minutes = Math.floor(duration / 60);
							const seconds = Math.round(duration % 60);
							return `${minutes}m ${seconds}s`;
						})(),
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
						chartStepType={chartStepType}
						chartType={chartType}
						description={metric.description}
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
						value={
							typeof metric.value === "number"
								? formatNumber(metric.value)
								: metric.value
						}
					/>
				))}
			</div>

			{/* Chart */}
			<div className="rounded border bg-sidebar">
				<div className="flex flex-col items-start justify-between gap-3 border-b px-3 py-2.5 sm:flex-row sm:px-4 sm:py-3">
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-base text-sidebar-foreground sm:text-lg">
							Traffic Trends
						</h2>
						<p className="text-sidebar-foreground/70 text-xs sm:text-sm">
							{dateRange.granularity === "hourly" ? "Hourly" : "Daily"} traffic
							data
						</p>
						{dateRange.granularity === "hourly" && dateDiff > 7 && (
							<div className="mt-1 flex items-start gap-1 text-amber-600 text-xs">
								<WarningIcon
									className="mt-0.5 shrink-0"
									size={14}
									weight="fill"
								/>
								<span className="leading-relaxed">
									Large date ranges may affect performance
								</span>
							</div>
						)}
					</div>
				</div>
				<div className="overflow-x-auto">
					<MetricsChartWithAnnotations
						className="rounded border-0"
						data={chartData}
						dateRange={{
							startDate: new Date(dateRange.start_date),
							endDate: new Date(dateRange.end_date),
							granularity: dateRange.granularity as
								| "hourly"
								| "daily"
								| "weekly"
								| "monthly",
						}}
						height={isMobile ? 250 : 350}
						isLoading={isLoading}
						onRangeSelect={setDateRangeAction}
						websiteId={websiteId}
					/>
				</div>
			</div>

			{/* Tables */}
			<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
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
					tabs={pagesTabs as any}
					title="Pages"
				/>
			</div>

			<CustomEventsSection
				customEventsData={customEventsData}
				isLoading={isLoading}
				onAddFilter={onAddFilter}
			/>

			{/* Technology */}
			<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
				<DataTable
					columns={deviceColumns}
					data={analytics.device_types || []}
					description="Device breakdown"
					initialPageSize={8}
					isLoading={isLoading}
					minHeight={350}
					onAddFilter={onAddFilter}
					tabs={[
						{
							id: "devices",
							label: "Devices",
							data: analytics.device_types || [],
							columns: deviceColumns,
							getFilter: (row: TechnologyData) => {
								const deviceDisplayToFilterMap: Record<string, string> = {
									laptop: "mobile",
									tablet: "tablet",
									desktop: "desktop",
								};
								return {
									field: "device_type",
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
					tabs={[
						{
							id: "browsers",
							label: "Browsers",
							data: analytics.browser_versions || [],
							columns: browserColumns,
							getFilter: (row: TechnologyData) => ({
								field: "browser_name",
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
					tabs={[
						{
							id: "operating_systems",
							label: "Operating Systems",
							data: analytics.operating_systems || [],
							columns: osColumns,
							getFilter: (row: TechnologyData) => ({
								field: "os_name",
								value: row.name,
							}),
						},
					]}
					title="Operating Systems"
				/>

				<GeoMapSection countries={geoData.countries} isLoading={isLoading} />
			</div>
		</div>
	);
}
