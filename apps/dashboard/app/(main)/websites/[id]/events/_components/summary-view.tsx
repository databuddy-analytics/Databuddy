"use client";

import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	ChartBarIcon,
	FunnelIcon,
	ListBulletsIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useParams } from "next/navigation";
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
	onFilterAction: (
		eventName: string,
		propertyKey: string,
		value: string
	) => void;
}

export function SummaryView({
	events,
	isFetching,
	isLoading,
	onFilterAction,
}: SummaryViewProps) {
	const params = useParams();
	const websiteId = params.id as string;
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
										({formatNumber(event.total_events)})
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
						<Link
							className="flex items-center gap-1 text-primary text-sm transition-colors hover:text-primary/80 hover:underline"
							href={`/websites/${websiteId}/events/${encodeURIComponent(activeEvent.name)}`}
						>
							View details
							<ArrowRightIcon className="size-3.5" />
						</Link>
					</>
				)}
			</div>

			{activeEvent && activeEvent.summaryProperties.length > 0 && (
				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{activeEvent.summaryProperties.map((prop) => (
						<PropertyCard
							eventName={activeEvent.name}
							key={prop.key}
							onFilterAction={onFilterAction}
							property={prop}
						/>
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
	eventName: string;
	property: ClassifiedProperty;
	onFilterAction: (
		eventName: string,
		propertyKey: string,
		value: string
	) => void;
}

function PropertyCard({
	eventName,
	property,
	onFilterAction,
}: PropertyCardProps) {
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

					return (
						<button
							aria-label={`Filter by ${property.key}: ${displayValue || "empty"}`}
							className="group relative flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-accent/50 focus:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							key={`${displayValue}-${idx}`}
							onClick={() =>
								onFilterAction(eventName, property.key, displayValue)
							}
							type="button"
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
										{formatNumber(count)}
									</span>
									<span className="w-10 text-right text-muted-foreground/60 text-xs tabular-nums">
										{percentage.toFixed(0)}%
									</span>
									<FunnelIcon
										aria-hidden="true"
										className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
										weight="duotone"
									/>
								</div>
							</div>
						</button>
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

function formatNumber(value: number): string {
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
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
