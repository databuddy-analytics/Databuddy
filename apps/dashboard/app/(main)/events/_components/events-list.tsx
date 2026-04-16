"use client";

import { LightningIcon } from "@phosphor-icons/react";
import { TableEmptyState } from "@/components/table/table-empty-state";
import { formatNumber } from "@/lib/formatters";
import { EVENT_COLORS } from "./events-trend-chart";
import type { CustomEventItem } from "./types";

interface EventsListProps {
	eventColorMap?: Map<string, string>;
	events: CustomEventItem[];
	isFetching?: boolean;
	isLoading?: boolean;
}

export function EventsList({
	events,
	eventColorMap,
	isLoading,
	isFetching,
}: EventsListProps) {
	if (isLoading) {
		return <EventsListSkeleton />;
	}

	if (events.length === 0) {
		return (
			<div className="rounded border bg-card">
				<div className="border-b px-4 py-3">
					<h3 className="font-medium text-foreground">Events</h3>
					<p className="text-muted-foreground text-sm">
						All tracked event types
					</p>
				</div>
				<div className="p-4">
					<TableEmptyState
						description="Events will appear here once tracked."
						icon={<LightningIcon className="size-6 text-muted-foreground" />}
						title="No events"
					/>
				</div>
			</div>
		);
	}

	const maxEvents = Math.max(...events.map((e) => e.total_events));

	return (
		<div className="rounded border bg-card">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div>
					<h3 className="font-medium text-foreground">Events</h3>
					<p className="text-muted-foreground text-sm">
						All tracked event types
					</p>
				</div>
				{isFetching && !isLoading && (
					<span className="text-muted-foreground text-xs">Updating...</span>
				)}
			</div>
			<div className="divide-y">
				<div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 text-muted-foreground text-xs">
					<span>Event Name</span>
					<span className="w-20 text-right">Events</span>
					<span className="w-20 text-right">Users</span>
					<span className="w-16 text-right">Share</span>
				</div>
				{events.map((event) => {
					const barWidth = (event.total_events / maxEvents) * 100;
					const safePercentage =
						event.percentage == null || Number.isNaN(event.percentage)
							? 0
							: event.percentage;

					return (
						<div
							className="group relative grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 transition-colors hover:bg-accent/50"
							key={event.name}
						>
							<div
								className="absolute inset-y-0 left-0 transition-all"
								style={{
									width: `${barWidth}%`,
									backgroundColor: `${eventColorMap?.get(event.name) ?? EVENT_COLORS[0]}0F`,
								}}
							/>
							<div className="relative z-10 flex items-center gap-2.5">
								<div
									className="size-2 shrink-0 rounded-full"
									style={{
										backgroundColor:
											eventColorMap?.get(event.name) ?? EVENT_COLORS[0],
									}}
								/>
								<span className="truncate font-medium text-foreground text-sm">
									{event.name}
								</span>
							</div>
							<span className="relative z-10 w-20 text-right font-medium text-foreground text-sm tabular-nums">
								{formatNumber(event.total_events)}
							</span>
							<span className="relative z-10 w-20 text-right text-muted-foreground text-sm tabular-nums">
								{formatNumber(event.unique_users)}
							</span>
							<span className="relative z-10 w-16 text-right">
								<span className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs tabular-nums">
									{safePercentage.toFixed(1)}%
								</span>
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

function EventsListSkeleton() {
	return (
		<div className="rounded border bg-card">
			<div className="border-b px-4 py-3">
				<div className="h-5 w-16 animate-pulse rounded bg-muted" />
				<div className="mt-1 h-4 w-36 animate-pulse rounded bg-muted" />
			</div>
			<div className="divide-y">
				{Array.from({ length: 5 }).map((_, i) => (
					<div
						className="flex items-center justify-between px-4 py-2.5"
						key={`skeleton-${i}`}
					>
						<div className="flex items-center gap-2.5">
							<div className="size-2 rounded bg-muted" />
							<div
								className="h-4 animate-pulse rounded bg-muted"
								style={{ width: `${120 - i * 15}px` }}
							/>
						</div>
						<div className="flex items-center gap-4">
							<div className="h-4 w-12 animate-pulse rounded bg-muted" />
							<div className="h-4 w-12 animate-pulse rounded bg-muted" />
							<div className="h-5 w-12 animate-pulse rounded bg-muted" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
