"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import {
	EventsStreamContent,
	type RecentCustomEvent,
} from "@/components/events/events-stream-content";
import { useEventsPageContext } from "../_components/events-page-context";
import { useGlobalEventsStream } from "./use-global-events-stream";

export default function EventsStreamPage() {
	return (
		<Suspense fallback={null}>
			<EventsStreamView />
		</Suspense>
	);
}

function EventsStreamView() {
	const { queryOptions, websiteFilters, dateRange, hasQueryId, isLoadingOrg } =
		useEventsPageContext();

	const [page, setPage] = useState(1);

	const eventsKey = useMemo(
		() => JSON.stringify({ dateRange, queryOptions, websiteFilters }),
		[dateRange, queryOptions, websiteFilters]
	);

	const { events, pagination, isLoading, isError, error } =
		useGlobalEventsStream(queryOptions, dateRange, websiteFilters, 50, page, {
			enabled: hasQueryId,
		});

	const renderEventName = useCallback((event: RecentCustomEvent) => {
		return (
			<div className="flex items-center gap-1.5">
				<span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary text-xs">
					{event.event_name}
				</span>
			</div>
		);
	}, []);

	return (
		<EventsStreamContent
			data={{ events, pagination, isLoading, isError, error }}
			eventsKey={eventsKey}
			isPageLoading={isLoadingOrg}
			onPageChange={setPage}
			page={page}
			renderEventName={renderEventName}
		/>
	);
}
