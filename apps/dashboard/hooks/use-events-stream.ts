import type { DateRange } from "@databuddy/shared/types/analytics";
import type {
	BatchQueryResponse,
	DynamicQueryFilter,
} from "@databuddy/shared/types/api";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useMemo } from "react";
import type {
	RawRecentCustomEvent,
	RecentCustomEvent,
} from "@/app/(main)/events/_components/types";
import { useBatchDynamicQuery } from "./use-dynamic-query";

export type EventsStreamScope =
	| string
	| { organizationId?: string; websiteId?: string };

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

export function useEventsStream(
	scope: EventsStreamScope,
	dateRange: DateRange,
	filters: DynamicQueryFilter[] = [],
	limit = 50,
	page = 1,
	options?: Partial<UseQueryOptions<BatchQueryResponse>>
) {
	const queryOptions = typeof scope === "string" ? { websiteId: scope } : scope;

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
			hasNext: events.length === limit,
			hasPrev: page > 1,
		},
	};
}
