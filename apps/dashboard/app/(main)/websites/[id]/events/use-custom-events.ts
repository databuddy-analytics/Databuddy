import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";

export function useCustomEventsData(
	websiteId: string,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<BatchQueryResponse>> & {
		filters?: DynamicQueryFilter[];
	}
) {
	const filters = options?.filters ?? [];

	return useBatchDynamicQuery(
		websiteId,
		dateRange,
		[
			{
				id: "custom_events_summary",
				parameters: ["custom_events_summary"],
				filters,
			},
			{ id: "custom_events", parameters: ["custom_events"], filters },
			{
				id: "custom_events_trends",
				parameters: ["custom_events_trends"],
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
				filters,
				limit: 500,
			},
			{
				id: "custom_events_property_distribution",
				parameters: ["custom_events_property_distribution"],
				filters,
				limit: 500,
			},
			{
				id: "custom_events_property_top_values",
				parameters: ["custom_events_property_top_values"],
				filters,
				limit: 100,
			},
		],
		options
	);
}
