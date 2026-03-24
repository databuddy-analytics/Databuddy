"use client";

import {
	ArrowClockwiseIcon,
	ChartBarIcon,
	ListBulletsIcon,
} from "@phosphor-icons/react";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { EmptyState } from "@/components/empty-state";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { getPropertyTypeLabel } from "./classify-properties";
import { formatCompactNumber } from "./events-utils";
import type {
	ClassifiedEvent,
	ClassifiedProperty,
	PropertyDistribution,
	PropertyTopValue,
} from "./types";

interface SummaryViewProps {
	events: ClassifiedEvent[];
	isFetching?: boolean;
	isLoading?: boolean;
}

export function SummaryView({
	events,
	isFetching,
	isLoading,
}: SummaryViewProps) {
	const [selectedEvent, setSelectedEvent] = useQueryState(
		"event",
		parseAsString.withDefault("")
	);

	const activeEvent = useMemo(() => {
		if (selectedEvent) {
			return events.find((e) => e.name === selectedEvent);
		}
		return events[0];
	}, [events, selectedEvent]);

	if (isLoading) {
		return <SummaryViewSkeleton />;
	}

	if (events.length === 0) {
		return (
			<div className="flex flex-1 items-center justify-center py-12">
				<EmptyState
					description="No aggregatable properties found"
					icon={<ChartBarIcon />}
					title="No properties"
					variant="minimal"
				/>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<Select
					onValueChange={setSelectedEvent}
					value={activeEvent?.name ?? events[0]?.name}
				>
					<SelectTrigger className="h-8 w-[200px]">
						<SelectValue placeholder="Select event" />
					</SelectTrigger>
					<SelectContent>
						{events.map((event) => (
							<SelectItem key={event.name} value={event.name}>
								<span className="flex items-center gap-2">
									<span>{event.name}</span>
									<span className="text-muted-foreground tabular-nums">
										({formatCompactNumber(event.total_events)})
									</span>
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				{activeEvent && (
					<>
						<span className="text-muted-foreground text-sm">
							{activeEvent.summaryProperties.length} propert
							{activeEvent.summaryProperties.length === 1 ? "y" : "ies"}
						</span>
						{isFetching && !isLoading && (
							<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
								<ArrowClockwiseIcon className="size-3 animate-spin" />
								<span>Updating…</span>
							</div>
						)}
					</>
				)}
			</div>

			{activeEvent && activeEvent.summaryProperties.length > 0 && (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{activeEvent.summaryProperties.map((prop) => (
						<PropertyCard key={prop.key} property={prop} />
					))}
				</div>
			)}

			{activeEvent && activeEvent.summaryProperties.length === 0 && (
				<div className="flex flex-1 items-center justify-center py-12">
					<EmptyState
						description="This event has no aggregatable properties. Check the Stream tab for individual event details."
						icon={<ListBulletsIcon />}
						title="No aggregatable properties"
						variant="minimal"
					/>
				</div>
			)}
		</div>
	);
}

interface PropertyCardProps {
	property: ClassifiedProperty;
}

function PropertyCard({ property }: PropertyCardProps) {
	const { classification, values } = property;
	const maxCount = Math.max(...values.map((v) => v.count));

	return (
		<div className="rounded border bg-card">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<span className="font-medium text-foreground text-sm">
						{property.key}
					</span>
					<span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
						{getPropertyTypeLabel(classification)}
					</span>
				</div>
				<span className="text-muted-foreground text-xs tabular-nums">
					{classification.cardinality} unique
				</span>
			</div>

			<div className="max-h-[180px] overflow-y-auto p-1.5">
				{values.map((value, idx) => {
					const displayValue = isPropertyDistribution(value)
						? value.property_value
						: value.property_value;
					const count = value.count;
					const percentage = value.percentage;
					const barWidth = (count / maxCount) * 100;
					const safePercentage =
						percentage == null || Number.isNaN(percentage) ? 0 : percentage;

					return (
						<div
							className="group relative flex w-full items-center gap-2 rounded px-2 py-1.5"
							key={`${displayValue}-${idx}`}
						>
							<div
								className="absolute inset-y-0 left-0 rounded bg-primary/8 transition-all group-hover:bg-primary/12"
								style={{ width: `${barWidth}%` }}
							/>
							<div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2">
								<span
									className="truncate text-foreground text-sm"
									title={displayValue}
								>
									{displayValue || "(empty)"}
								</span>
								<div className="flex shrink-0 items-center gap-2">
									<span className="text-muted-foreground text-xs tabular-nums">
										{formatCompactNumber(count)}
									</span>
									<span className="w-10 text-right text-muted-foreground/60 text-xs tabular-nums">
										{safePercentage.toFixed(0)}%
									</span>
								</div>
							</div>
						</div>
					);
				})}

				{classification.render_strategy === "top_n_with_other" &&
					values.length > 0 && (
						<div className="mt-1 border-t pt-2 text-center text-muted-foreground/60 text-xs">
							+{classification.cardinality - values.length} more
						</div>
					)}
			</div>
		</div>
	);
}

function isPropertyDistribution(
	value: PropertyTopValue | PropertyDistribution
): value is PropertyDistribution {
	return "cardinality" in value;
}

function SummaryViewSkeleton() {
	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<div className="h-8 w-[200px] animate-pulse rounded bg-muted" />
				<div className="h-4 w-20 animate-pulse rounded bg-muted" />
			</div>
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
				{[1, 2, 3].map((i) => (
					<div className="rounded border bg-card" key={i}>
						<div className="flex items-center justify-between border-b px-3 py-2">
							<div className="h-4 w-16 animate-pulse rounded bg-muted" />
							<div className="h-3 w-12 animate-pulse rounded bg-muted" />
						</div>
						<div className="space-y-1.5 p-1.5">
							{[1, 2, 3, 4].map((j) => (
								<div
									className="flex items-center justify-between rounded px-2 py-1.5"
									key={j}
								>
									<div className="h-4 w-20 animate-pulse rounded bg-muted" />
									<div className="h-3 w-12 animate-pulse rounded bg-muted" />
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
