import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "./use-dynamic-query";

export type CustomEventsScope =
	| string
	| { organizationId?: string; websiteId?: string };

export function useCustomEventsData(
	scope: CustomEventsScope,
	dateRange: DateRange,
	options?: Partial<UseQueryOptions<BatchQueryResponse>> & {
		filters?: DynamicQueryFilter[];
	}
) {
	const queryOptions = typeof scope === "string" ? { websiteId: scope } : scope;
	const filters = options?.filters ?? [];
	const { filters: _filters, ...batchOptions } = options ?? {};
	const isOrgLevel = !queryOptions.websiteId;

	const essentialQueries = useMemo(
		() => [
			{
				id: "custom_events_summary",
				parameters: ["custom_events_summary"],
				filters,
			},
			{ id: "custom_events", parameters: ["custom_events"], filters },
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
		],
		[filters]
	);

	const propertyQueries = useMemo(
		() => [
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

	const essential = useBatchDynamicQuery(
		queryOptions,
		dateRange,
		essentialQueries,
		batchOptions
	);

	// JSONExtractKeys arrayJoin is 30s+ on All-websites view, skip when no websiteId.
	const properties = useBatchDynamicQuery(
		queryOptions,
		dateRange,
		propertyQueries,
		{ ...batchOptions, enabled: (batchOptions.enabled ?? true) && !isOrgLevel }
	);

	const results = useMemo(
		() => [...(essential.results ?? []), ...(properties.results ?? [])],
		[essential.results, properties.results]
	);

	return {
		results,
		isLoading: essential.isLoading,
		isFetching: essential.isFetching || properties.isFetching,
		isPending: essential.isPending,
		isError: essential.isError || properties.isError,
		error: essential.error ?? properties.error,
		refetch: () => {
			essential.refetch();
			properties.refetch();
		},
		isPropertiesLoading: properties.isLoading,
	};
}
