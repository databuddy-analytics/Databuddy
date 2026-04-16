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
	const essentialQueries = useMemo(
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
		options
	);

	// Skip on org-level: JSONExtractKeys arrayJoin is 30s+ on All-websites view.
	const isOrgLevel = !queryOptions.websiteId;
	const properties = useBatchDynamicQuery(
		queryOptions,
		dateRange,
		propertyQueries,
		{ ...options, enabled: (options?.enabled ?? true) && !isOrgLevel }
	);

	const mergedResults = useMemo(() => {
		const all = [...(essential.results ?? []), ...(properties.results ?? [])];
		return all.length > 0 ? all : [];
	}, [essential.results, properties.results]);

	return {
		results: mergedResults,
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
