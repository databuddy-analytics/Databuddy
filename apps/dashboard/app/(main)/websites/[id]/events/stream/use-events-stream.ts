import type { DateRange } from"@databuddy/shared/types/analytics";
import type {
	DynamicQueryFilter,
	DynamicQueryResponse,
} from"@databuddy/shared/types/api";
import type { UseQueryOptions } from"@tanstack/react-query";
import { useMemo } from"react";
import { useDynamicQuery } from"@/hooks/use-dynamic-query";
import type {
	RawRecentCustomEvent,
	RecentCustomEvent,
} from"../_components/types";

function parseEventProperties(
	rawEvent: RawRecentCustomEvent
): RecentCustomEvent {
	let parsedProperties: Record<string, unknown> = {};
	try {
		parsedProperties =
			typeof rawEvent.properties ==="string"
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
	websiteId: string,
	dateRange: DateRange,
	limit = 50,
	page = 1,
	filters?: DynamicQueryFilter[],
	options?: Partial<UseQueryOptions<DynamicQueryResponse>>
) {
	const queryResult = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id:"events-stream",
			parameters: ["custom_events_recent"],
			limit,
			page,
			filters,
		},
		{
			...options,
			staleTime: 30 * 1000,
			gcTime: 5 * 60 * 1000,
		}
	);

	const events = useMemo(() => {
		const rawEvents =
			((queryResult.data as Record<string, unknown>)
				?.custom_events_recent as RawRecentCustomEvent[]) || [];
		return rawEvents.map(parseEventProperties);
	}, [queryResult.data]);

	const hasNextPage = useMemo(
		() => events.length === limit,
		[events.length, limit]
	);

	const hasPrevPage = useMemo(() => page > 1, [page]);

	return {
		...queryResult,
		events,
		pagination: {
			page,
			limit,
			hasNext: hasNextPage,
			hasPrev: hasPrevPage,
		},
	};
}
