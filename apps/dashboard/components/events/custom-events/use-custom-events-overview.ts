"use client";

import type { DateRange } from "@/types/analytics";
import { dayjs } from "@databuddy/ui";
import { useMemo } from "react";
import { classifyEventProperties } from "./classify-properties";
import {
	formatDateLabel,
	generateDateRange,
	getGranularity,
	normalizeDateKey,
} from "./events-utils";
import type {
	ClassifiedEvent,
	CustomEventItem,
	CustomEventsPerEventChartData,
	CustomEventsSummary,
	CustomEventsTrend,
	CustomEventsTrendByEvent,
	MiniChartDataPoint,
	PropertyClassification,
	PropertyDistribution,
	PropertyTopValue,
} from "./types";

interface CustomEventsQueryResult {
	data?: Record<string, unknown>;
	queryId?: string;
}

type QueryResults = CustomEventsQueryResult[] | undefined;
type TrendMetric = Exclude<keyof CustomEventsTrend, "date">;

interface UseCustomEventsOverviewOptions {
	dateRange: DateRange;
	results: QueryResults;
}

function getRawData<T>(results: QueryResults, id: string): T[] {
	return (results?.find((r) => r.queryId === id)?.data?.[id] as T[]) ?? [];
}

function buildTrendSeries(
	allDates: string[],
	trendsMap: Map<string, CustomEventsTrend>,
	field: TrendMetric
): MiniChartDataPoint[] {
	return allDates.map((date) => ({
		date,
		value: (trendsMap.get(date)?.[field] as number | undefined) ?? 0,
	}));
}

function buildPerEventChartData({
	allDates,
	granularity,
	trendsByEventData,
}: {
	allDates: string[];
	granularity: "hourly" | "daily";
	trendsByEventData: CustomEventsTrendByEvent[];
}): CustomEventsPerEventChartData {
	if (trendsByEventData.length === 0) {
		return { data: [], eventNames: [] };
	}

	const eventNamesSet = new Set<string>();
	const dateMap = new Map<string, Record<string, string | number>>();

	for (const row of trendsByEventData) {
		const rawDate = normalizeDateKey(row.date, granularity);
		eventNamesSet.add(row.event_name);

		const existing = dateMap.get(rawDate) ?? {
			date: formatDateLabel(rawDate, granularity),
		};
		existing[row.event_name] =
			((existing[row.event_name] as number | undefined) ?? 0) +
			row.total_events;
		dateMap.set(rawDate, existing);
	}

	const eventNames = [...eventNamesSet];
	const data = allDates.map((date) => {
		const existing = dateMap.get(date);
		const row: Record<string, string | number> = {
			date: formatDateLabel(date, granularity),
		};
		for (const name of eventNames) {
			row[name] = (existing?.[name] as number | undefined) ?? 0;
		}
		return row;
	});

	return { data, eventNames };
}

export function useCustomEventsOverview({
	results,
	dateRange,
}: UseCustomEventsOverviewOptions) {
	const granularity = getGranularity(dateRange);

	const summaryData = getRawData<CustomEventsSummary>(
		results,
		"custom_events_summary"
	);
	const trendsData = getRawData<CustomEventsTrend>(
		results,
		"custom_events_trends"
	);
	const trendsByEventData = getRawData<CustomEventsTrendByEvent>(
		results,
		"custom_events_trends_by_event"
	);
	const eventsListData = getRawData<CustomEventItem>(results, "custom_events");
	const classificationsData = getRawData<PropertyClassification>(
		results,
		"custom_events_property_classification"
	);
	const distributionsData = getRawData<PropertyDistribution>(
		results,
		"custom_events_property_distribution"
	);
	const topValuesData = getRawData<PropertyTopValue>(
		results,
		"custom_events_property_top_values"
	);

	const summary: CustomEventsSummary = summaryData[0] ?? {
		total_events: 0,
		unique_event_types: 0,
		unique_pages: 0,
		unique_sessions: 0,
		unique_users: 0,
	};

	const classifiedEvents = useMemo<ClassifiedEvent[]>(
		() =>
			classifyEventProperties(
				eventsListData,
				classificationsData,
				distributionsData,
				topValuesData
			),
		[eventsListData, classificationsData, distributionsData, topValuesData]
	);

	const allDates = useMemo(
		() =>
			generateDateRange(dateRange.start_date, dateRange.end_date, granularity),
		[dateRange.start_date, dateRange.end_date, granularity]
	);

	const trendsMap = useMemo(
		() =>
			new Map(
				trendsData.map((trend) => [
					normalizeDateKey(trend.date, granularity),
					trend,
				])
			),
		[trendsData, granularity]
	);

	const miniChartData = useMemo(
		() => ({
			total_events: buildTrendSeries(allDates, trendsMap, "total_events"),
			unique_users: buildTrendSeries(allDates, trendsMap, "unique_users"),
			unique_event_types: buildTrendSeries(
				allDates,
				trendsMap,
				"unique_event_types"
			),
			unique_sessions: buildTrendSeries(allDates, trendsMap, "unique_sessions"),
			unique_pages: buildTrendSeries(allDates, trendsMap, "unique_pages"),
		}),
		[allDates, trendsMap]
	);

	const chartData = useMemo(
		() =>
			allDates.map((date) => {
				const existing = trendsMap.get(date);
				return {
					date: formatDateLabel(date, granularity),
					events: existing?.total_events ?? 0,
					users: existing?.unique_users ?? 0,
				};
			}),
		[allDates, trendsMap, granularity]
	);

	const perEventChartData = useMemo(
		() =>
			buildPerEventChartData({
				allDates,
				granularity,
				trendsByEventData,
			}),
		[allDates, granularity, trendsByEventData]
	);

	const todayDate = dayjs().format("YYYY-MM-DD");
	const todayEvent = trendsData.find(
		(event) => dayjs(event.date).format("YYYY-MM-DD") === todayDate
	);

	return {
		chartData,
		classifiedEvents,
		miniChartData,
		perEventChartData,
		summary,
		todayEvents: todayEvent?.total_events ?? 0,
		todayUsers: todayEvent?.unique_users ?? 0,
	};
}

export { getRawData };
