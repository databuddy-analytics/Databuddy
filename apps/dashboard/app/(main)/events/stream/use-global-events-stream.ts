import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import type {
	RawRecentCustomEvent,
	RecentCustomEvent,
} from "../_components/types";

interface QueryOptions {
	organizationId?: string;
	websiteId?: string;
}

function parseEventProperties(
	rawEvent: RawRecentCustomEvent
): RecentCustomEvent {
	let parsedProperties: Record<string, unknown> = {};
	try {
		parsedProperties =
			typeof rawEvent.properties === "string"
				? JSON.parse(rawEvent.properties)
				: rawEvent.properties;
	} catch {
		parsedProperties = {};
	}
	return {
		...rawEvent,
		name: rawEvent.event_name,
		properties: parsedProperties,
	};
}

export function useGlobalEventsStream(
	queryOptions: QueryOptions,
	dateRange: DateRange,
	filters: DynamicQueryFilter[] = [],
	limit = 50,
	page = 1,
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queries = useMemo(
		() => [
			{
				id: "events-stream",
				parameters: ["custom_events_recent"],
				limit,
				page,
				filters,
			},
		],
		[limit, page, filters]
	);

	const { results, isLoading, isError, error, isFetching, refetch } =
		useBatchDynamicQuery(queryOptions, dateRange, queries, {
			...options,
			staleTime: 30 * 1000,
			gcTime: 5 * 60 * 1000,
		});

	const events = useMemo(() => {
		const streamResult = results?.find((r) => r.queryId === "events-stream");
		const rawEvents =
			(streamResult?.data?.custom_events_recent as RawRecentCustomEvent[]) ||
			[];
		return rawEvents.map(parseEventProperties);
	}, [results]);

	const hasNextPage = useMemo(
		() => events.length === limit,
		[events.length, limit]
	);

	const hasPrevPage = useMemo(() => page > 1, [page]);

	return {
		events,
		isLoading,
		isError,
		error,
		isFetching,
		refetch,
		pagination: {
			page,
			limit,
			hasNext: hasNextPage,
			hasPrev: hasPrevPage,
		},
	};
}
