"use client";

import { ArrowSquareOutIcon } from "@phosphor-icons/react";
import { FunnelIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
	EventsStreamContent,
	type RecentCustomEvent,
} from "@/components/events/events-stream-content";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useEventsStream } from "@/hooks/use-events-stream";
import {
	addDynamicFilterAtom,
	dynamicQueryFiltersAtom,
} from "@/stores/jotai/filterAtoms";

export default function EventsStreamPage() {
	const params = useParams();
	const { id: websiteId } = params;

	if (!websiteId || typeof websiteId !== "string") {
		notFound();
	}

	const { dateRange } = useDateFilters();
	const [filters] = useAtom(dynamicQueryFiltersAtom);
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const [page, setPage] = useState(1);

	const eventsKey = useMemo(
		() => JSON.stringify({ dateRange, filters }),
		[dateRange, filters]
	);

	const { events, pagination, isLoading, isError, error } = useEventsStream(
		websiteId,
		dateRange,
		filters,
		50,
		page
	);

	const handleAddFilter = useCallback(
		(eventName: string) => {
			addFilter({ field: "event_name", operator: "eq", value: eventName });
		},
		[addFilter]
	);

	const renderEventName = useCallback(
		(event: RecentCustomEvent) => (
			<div className="flex items-center gap-1.5">
				<Link
					className="group flex items-center gap-1"
					href={`/websites/${websiteId}/events/${encodeURIComponent(event.event_name)}`}
				>
					<span className="rounded bg-primary/10 px-2 py-1 font-medium text-primary text-xs transition-colors group-hover:bg-primary/20">
						{event.event_name}
					</span>
					<ArrowSquareOutIcon className="size-3 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
				</Link>
				<button
					aria-label={`Filter by ${event.event_name}`}
					className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/row:opacity-100"
					onClick={() => handleAddFilter(event.event_name)}
					title="Filter by this event"
					type="button"
				>
					<FunnelIcon className="size-3.5" weight="duotone" />
				</button>
			</div>
		),
		[websiteId, handleAddFilter]
	);

	return (
		<EventsStreamContent
			data={{ events, pagination, isLoading, isError, error }}
			eventsKey={eventsKey}
			onPageChange={setPage}
			page={page}
			renderEventName={renderEventName}
		/>
	);
}
