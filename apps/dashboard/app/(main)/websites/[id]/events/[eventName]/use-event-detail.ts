import type { DateRange } from "@databuddy/shared/types/analytics";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import type {
	CustomEventsTrend,
	PropertyClassification,
	PropertyDistribution,
	PropertyTopValue,
	RawRecentCustomEvent,
	RecentCustomEvent,
} from "../_components/types";

interface EventSummary {
	total_events: number;
	unique_pages: number;
	unique_sessions: number;
	unique_users: number;
}

interface ClassifiedPropertySimple {
	classification: {
		cardinality: number;
		inferred_type: string;
	};
	key: string;
	values: Array<{
		property_value: string;
		count: number;
		percentage: number;
	}>;
}

interface EventDetailData {
	classifiedProperties: ClassifiedPropertySimple[];
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

		const classifiedProperties: ClassifiedPropertySimple[] =
			classificationsData.map((classification) => {
				const propKey = classification.property_key;

				let values: Array<{
					property_value: string;
					count: number;
					percentage: number;
				}> = [];

				if (
					classification.render_strategy === "distribution_bar" ||
					classification.render_strategy === "top_n_chart"
				) {
					const distValues = distributionsData.filter(
						(d) => d.property_key === propKey
					);
					values = distValues.map((d) => ({
						property_value: d.property_value,
						count: d.count,
						percentage: d.percentage,
					}));
				} else {
					const topVals = topValuesData.filter(
						(t) => t.property_key === propKey
					);
					values = topVals.map((t) => ({
						property_value: t.property_value,
						count: t.count,
						percentage: t.percentage,
					}));
				}

				return {
					key: propKey,
					classification: {
						cardinality: classification.cardinality,
						inferred_type: classification.inferred_type,
					},
					values,
				};
			});

		classifiedProperties.sort((a, b) => {
			if (a.values.length === 0 && b.values.length > 0) {
				return 1;
			}
			if (a.values.length > 0 && b.values.length === 0) {
				return -1;
			}
			return a.classification.cardinality - b.classification.cardinality;
		});

		return {
			summary: summaryData[0] ?? {
				total_events: 0,
				unique_users: 0,
				unique_sessions: 0,
				unique_pages: 0,
			},
			trends: trendsData,
			recentEvents,
			classifiedProperties: classifiedProperties.filter(
				(p) => p.values.length > 0
			),
		};
	}, [results]);

	return {
		data,
		isLoading,
		error,
	};
}
