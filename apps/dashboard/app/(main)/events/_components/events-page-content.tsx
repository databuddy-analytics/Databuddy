"use client";

import {
	ArrowClockwiseIcon,
	LightningIcon,
	TagIcon,
	TrendUpIcon,
	UserIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import dayjs from "@/lib/dayjs";
import { classifyEventProperties } from "./classify-properties";
import { EventsList } from "./events-list";
import { useEventsPageContext } from "./events-page-context";
import { EVENT_COLORS, EventsTrendChart } from "./events-trend-chart";
import {
	formatCompactNumber,
	formatDateLabel,
	generateDateRange,
	normalizeDateKey,
} from "./events-utils";
import { SummaryView } from "./summary-view";
import type {
	CustomEventItem,
	CustomEventsSummary,
	CustomEventsTrend,
	CustomEventsTrendByEvent,
	MiniChartDataPoint,
	PropertyClassification,
	PropertyDistribution,
	PropertyTopValue,
} from "./types";

export function EventsPageContent() {
	const { dateRange, isLoadingOrg, query } = useEventsPageContext();
	const { chartType, chartStepType } = useChartPreferences("events");

	const { results: eventsResults, isLoading, isFetching, error } = query;

	const getRawData = <T,>(id: string): T[] =>
		(eventsResults?.find((r) => r.queryId === id)?.data?.[id] as T[]) ?? [];

	const summaryData = getRawData<CustomEventsSummary>("custom_events_summary");
	const trendsData = getRawData<CustomEventsTrend>("custom_events_trends");
	const trendsByEventData = getRawData<CustomEventsTrendByEvent>(
		"custom_events_trends_by_event"
	);
	const eventsListData = getRawData<CustomEventItem>("custom_events");
	const classificationsData = getRawData<PropertyClassification>(
		"custom_events_property_classification"
	);
	const distributionsData = getRawData<PropertyDistribution>(
		"custom_events_property_distribution"
	);
	const topValuesData = getRawData<PropertyTopValue>(
		"custom_events_property_top_values"
	);

	const classifiedEvents = useMemo(
		() =>
			classifyEventProperties(
				eventsListData,
				classificationsData,
				distributionsData,
				topValuesData
			),
		[eventsListData, classificationsData, distributionsData, topValuesData]
	);

	const summary = summaryData[0] ?? {
		total_events: 0,
		unique_event_types: 0,
		unique_users: 0,
	};

	const allDates = useMemo(
		() =>
			generateDateRange(
				dateRange.start_date,
				dateRange.end_date,
				dateRange.granularity
			),
		[dateRange.start_date, dateRange.end_date, dateRange.granularity]
	);

	const trendsMap = useMemo(
		() =>
			new Map(
				trendsData.map((t) => [
					normalizeDateKey(t.date, dateRange.granularity),
					t,
				])
			),
		[trendsData, dateRange.granularity]
	);

	const miniChartData = useMemo(() => {
		const createSeries = (
			field: keyof CustomEventsTrend
		): MiniChartDataPoint[] =>
			allDates.map((date) => ({
				date,
				value: (trendsMap.get(date)?.[field] as number) ?? 0,
			}));

		return {
			total_events: createSeries("total_events"),
			unique_users: createSeries("unique_users"),
			unique_event_types: createSeries("unique_event_types"),
		};
	}, [trendsMap, allDates]);

	const chartData = useMemo(
		() =>
			allDates.map((date) => {
				const existing = trendsMap.get(date);
				return {
					date: formatDateLabel(date, dateRange.granularity),
					events: existing?.total_events ?? 0,
					users: existing?.unique_users ?? 0,
				};
			}),
		[trendsMap, dateRange.granularity, allDates]
	);

	const perEventChartData = useMemo(() => {
		if (trendsByEventData.length === 0) {
			return {
				data: [] as Record<string, string | number>[],
				eventNames: [] as string[],
			};
		}

		const eventNamesSet = new Set<string>();
		const dateMap = new Map<string, Record<string, string | number>>();

		for (const row of trendsByEventData) {
			const rawDate = normalizeDateKey(row.date, dateRange.granularity);
			eventNamesSet.add(row.event_name);

			const existing = dateMap.get(rawDate) ?? {
				date: formatDateLabel(rawDate, dateRange.granularity),
			};
			existing[row.event_name] =
				((existing[row.event_name] as number) ?? 0) + row.total_events;
			dateMap.set(rawDate, existing);
		}

		const eventNames = [...eventNamesSet];
		const data = allDates.map((date) => {
			const existing = dateMap.get(date);
			const row: Record<string, string | number> = {
				date: formatDateLabel(date, dateRange.granularity),
			};
			for (const name of eventNames) {
				row[name] = (existing?.[name] as number) ?? 0;
			}
			return row;
		});

		return { data, eventNames };
	}, [trendsByEventData, dateRange.granularity, allDates]);

	const eventColorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const [idx, name] of perEventChartData.eventNames.entries()) {
			map.set(name, EVENT_COLORS[idx % EVENT_COLORS.length] ?? "#888");
		}
		return map;
	}, [perEventChartData.eventNames]);

	const todayDate = dayjs().format("YYYY-MM-DD");
	const todayEvent = trendsData.find(
		(event) => dayjs(event.date).format("YYYY-MM-DD") === todayDate
	);
	const todayEvents = todayEvent?.total_events ?? 0;
	const todayUsers = todayEvent?.unique_users ?? 0;

	const isPageLoading = isLoadingOrg || isLoading;

	if (error) {
		return (
			<div className="p-3 sm:p-4">
				<div className="rounded border border-destructive/20 bg-destructive/5 p-6">
					<div className="flex flex-col items-center text-center">
						<div className="mb-4 flex size-12 items-center justify-center rounded bg-destructive/10">
							<LightningIcon
								className="size-6 text-destructive"
								weight="duotone"
							/>
						</div>
						<h4 className="mb-2 font-semibold text-destructive">
							Error loading data
						</h4>
						<p className="max-w-md text-balance text-destructive/80 text-sm">
							There was an issue loading your events analytics. Please try
							refreshing using the toolbar above.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const showRefreshingIndicator = isFetching && !isLoading;

	return (
		<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
			{showRefreshingIndicator && (
				<div className="flex items-center justify-center gap-2 rounded border border-primary/20 bg-primary/5 py-2 text-primary text-sm">
					<ArrowClockwiseIcon className="size-4 animate-spin" />
					<span>Refreshing data…</span>
				</div>
			)}
			{isPageLoading ? (
				<EventsLoadingSkeleton />
			) : summary.total_events === 0 ? (
				<div className="flex flex-1 items-center justify-center py-16">
					<EmptyState
						description={
							<>
								Events will appear here once your tracker starts collecting
								them. Use{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									databuddy.track()
								</code>{" "}
								to send custom events.
							</>
						}
						icon={<LightningIcon />}
						title="No events yet"
						variant="minimal"
					/>
				</div>
			) : (
				<>
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
						<StatCard
							chartData={isPageLoading ? undefined : miniChartData.total_events}
							chartStepType={chartStepType}
							chartType={chartType}
							description={`${formatCompactNumber(todayEvents)} today`}
							icon={LightningIcon}
							id="events-total"
							isLoading={isPageLoading}
							showChart
							title="Total Events"
							value={formatCompactNumber(summary.total_events)}
						/>
						<StatCard
							chartData={
								isPageLoading ? undefined : miniChartData.unique_event_types
							}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={TagIcon}
							id="events-types"
							isLoading={isPageLoading}
							showChart
							title="Event Types"
							value={formatCompactNumber(summary.unique_event_types)}
						/>
						<StatCard
							chartData={isPageLoading ? undefined : miniChartData.unique_users}
							chartStepType={chartStepType}
							chartType={chartType}
							description={`${formatCompactNumber(todayUsers)} today`}
							icon={UserIcon}
							id="events-users"
							isLoading={isPageLoading}
							showChart
							title="Unique Users"
							value={formatCompactNumber(summary.unique_users)}
						/>
						<StatCard
							chartData={isPageLoading ? undefined : miniChartData.total_events}
							chartStepType={chartStepType}
							chartType={chartType}
							description={`${summary.unique_users > 0 ? (summary.total_events / summary.unique_users).toFixed(1) : "0"} per user`}
							icon={TrendUpIcon}
							id="events-today"
							isLoading={isPageLoading}
							showChart
							title="Events Today"
							value={formatCompactNumber(todayEvents)}
						/>
					</div>

					<EventsTrendChart
						chartData={chartData}
						eventNames={perEventChartData.eventNames}
						isFetching={isFetching}
						isLoading={isPageLoading}
						perEventData={perEventChartData.data}
					/>

					<EventsList
						eventColorMap={eventColorMap}
						events={eventsListData}
						isFetching={isFetching}
						isLoading={isPageLoading}
					/>

					<div className="rounded border bg-card">
						<div className="border-b px-4 py-3">
							<h3 className="font-medium text-foreground">Property Summary</h3>
							<p className="text-muted-foreground text-sm">
								Aggregatable properties by event type
							</p>
						</div>
						<div className="p-4">
							<SummaryView
								events={classifiedEvents}
								isFetching={isFetching}
								isLoading={isPageLoading}
							/>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function EventsLoadingSkeleton() {
	return (
		<div className="space-y-3 sm:space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div className="rounded border bg-card p-3 sm:p-4" key={`stat-${i}`}>
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="size-8 rounded" />
						</div>
						<Skeleton className="mt-2 h-8 w-24" />
						<Skeleton className="mt-1 h-3 w-16" />
						<Skeleton className="mt-3 h-16 w-full" />
					</div>
				))}
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-4 py-3">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="mt-1 h-3 w-24" />
				</div>
				<Skeleton className="h-[350px] w-full" />
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-4 py-3">
					<Skeleton className="h-5 w-32" />
					<Skeleton className="mt-1 h-3 w-48" />
				</div>
				<div className="p-4">
					<Skeleton className="h-48 w-full" />
				</div>
			</div>
		</div>
	);
}
