import type { DateRange } from "@/types/analytics";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { classifyEventProperties } from "@/components/events/custom-events";
import type {
	ClassifiedProperty,
	CustomEventsTrend,
	PropertyClassification,
	PropertyDistribution,
	PropertyTopValue,
	RawRecentCustomEvent,
	RecentCustomEvent,
} from "@/components/events/custom-events";

interface EventSummary {
	total_events: number;
	unique_pages: number;
	unique_sessions: number;
	unique_users: number;
}

interface EventDetailData {
	classifiedProperties: ClassifiedProperty[];
	recentEvents: RecentCustomEvent[];
	summary: EventSummary;
	trends: CustomEventsTrend[];
}

export function useEventDetailData(
	websiteId: string,
	eventName: string,
	dateRange: DateRange
) {
	const eventFilter = {
		field: "event_name",
		operator: "eq" as const,
		value: eventName,
	};

	const { results, isLoading, error } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "custom_events_summary",
				parameters: ["custom_events_summary"],
				filters: [eventFilter],
			},
			{
				id: "custom_events_trends",
				parameters: ["custom_events_trends"],
				filters: [eventFilter],
			},
			{
				id: "custom_events_property_classification",
				parameters: ["custom_events_property_classification"],
				filters: [eventFilter],
				limit: 100,
			},
			{
				id: "custom_events_property_distribution",
				parameters: ["custom_events_property_distribution"],
				filters: [eventFilter],
				limit: 200,
			},
			{
				id: "custom_events_property_top_values",
				parameters: ["custom_events_property_top_values"],
				filters: [eventFilter],
				limit: 100,
			},
			{
				id: "custom_events_recent",
				parameters: ["custom_events_recent"],
				filters: [eventFilter],
				limit: 50,
			},
		],
		{
			queryKey: ["eventDetail", websiteId, eventName, dateRange],
		}
	);

	const data = useMemo<EventDetailData | null>(() => {
		if (!results) {
			return null;
		}

		const getRawData = <T>(id: string): T[] =>
			(results.find((r) => r.queryId === id)?.data?.[id] as T[]) ?? [];

		const summaryData = getRawData<EventSummary>("custom_events_summary");
		const trendsData = getRawData<CustomEventsTrend>("custom_events_trends");
		const classificationsData = getRawData<PropertyClassification>(
			"custom_events_property_classification"
		);
		const distributionsData = getRawData<PropertyDistribution>(
			"custom_events_property_distribution"
		);
		const topValuesData = getRawData<PropertyTopValue>(
			"custom_events_property_top_values"
		);
		const recentData = getRawData<RawRecentCustomEvent>("custom_events_recent");

		const recentEvents: RecentCustomEvent[] = recentData.map((item) => {
			let parsedProperties: Record<string, unknown> = {};
			try {
				parsedProperties =
					typeof item.properties === "string"
						? JSON.parse(item.properties)
						: item.properties;
			} catch {
				parsedProperties = {};
			}
			return {
				...item,
				name: item.event_name,
				properties: parsedProperties,
			};
		});

		const summary = summaryData[0] ?? {
			total_events: 0,
			unique_users: 0,
			unique_sessions: 0,
			unique_pages: 0,
		};
		const [classifiedEvent] = classifyEventProperties(
			[
				{
					events_with_properties: 0,
					first_occurrence: "",
					last_occurrence: "",
					name: eventName,
					percentage: 100,
					total_events: summary.total_events,
					unique_sessions: summary.unique_sessions,
					unique_users: summary.unique_users,
				},
			],
			classificationsData,
			distributionsData,
			topValuesData
		);
		const classifiedProperties = (
			classifiedEvent?.summaryProperties ?? []
		).filter((property) => property.values.length > 0);

		return {
			summary,
			trends: trendsData,
			recentEvents,
			classifiedProperties,
		};
	}, [results, eventName]);

	return {
		data,
		isLoading,
		error,
	};
}
