import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";

interface QueryOptions {
	organizationId?: string;
	websiteId?: string;
}

export function useGlobalCustomEventsData(
	queryOptions: QueryOptions,
	dateRange: DateRange,
	filters: DynamicQueryFilter[] = [],
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries = useMemo(
		() => [
			{
				id: "custom_events_summary",
				parameters: ["custom_events_summary"],
				filters,
			},
			{
				id: "custom_events",
				parameters: ["custom_events"],
				filters,
			},
			{
				id: "custom_events_trends",
				parameters: ["custom_events_trends"],
				limit: 1000,
				filters,
			},
			{
				id: "custom_events_trends_by_event",
				parameters: ["custom_events_trends_by_event"],
				limit: 5000,
				filters,
			},
			{
				id: "custom_events_property_classification",
				parameters: ["custom_events_property_classification"],
				limit: 500,
				filters,
			},
			{
				id: "custom_events_property_distribution",
				parameters: ["custom_events_property_distribution"],
				limit: 500,
				filters,
			},
			{
				id: "custom_events_property_top_values",
				parameters: ["custom_events_property_top_values"],
				limit: 100,
				filters,
			},
		],
		[filters]
	);

	return useBatchDynamicQuery(queryOptions, dateRange, queries, options);
}
