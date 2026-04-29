"use client";

import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useMemo } from "react";
import { formatNumber } from "@/lib/formatters";
import { getPropertyTypeLabel } from "./classify-properties";
import { PropertyValueCard } from "./property-value-card";
import type { ClassifiedEvent, ClassifiedProperty } from "./types";
import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	ChartBarIcon,
	ListBulletsIcon,
} from "@databuddy/ui/icons";
import { Badge, EmptyState } from "@databuddy/ui";
import { Select } from "@databuddy/ui/client";

interface PropertySummaryProps {
	events: ClassifiedEvent[];
	getEventHref?: (eventName: string) => string;
	isFetching?: boolean;
	isLoading?: boolean;
	onPropertyValueSelect?: (
		eventName: string,
		propertyKey: string,
		value: string
	) => void;
	selectionQueryKey?: string;
}

export function PropertySummary({
	events,
	getEventHref,
	isFetching,
	isLoading,
	onPropertyValueSelect,
	selectionQueryKey = "event",
}: PropertySummaryProps) {
	const [selectedEvent, setSelectedEvent] = useQueryState(
		selectionQueryKey,
		parseAsString.withDefault("")
	);

	const activeEvent = useMemo(() => {
		if (selectedEvent) {
			return events.find((event) => event.name === selectedEvent) ?? events[0];
		}
		return events[0];
	}, [events, selectedEvent]);

	if (isLoading) {
		return <PropertySummarySkeleton />;
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
		<div className="space-y-3">
			<div className="flex min-h-8 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<Select
						onValueChange={(value) => setSelectedEvent(String(value))}
						value={activeEvent.name}
					>
						<Select.Trigger className="w-full sm:w-60" />
						<Select.Content className="max-h-64 overflow-y-auto">
							{events.map((event) => (
								<Select.Item key={event.name} value={event.name}>
									{event.name}
								</Select.Item>
							))}
						</Select.Content>
					</Select>
					<Badge size="sm" variant="muted">
						{activeEvent.summaryProperties.length} propert
						{activeEvent.summaryProperties.length === 1 ? "y" : "ies"}
					</Badge>
					<Badge size="sm" variant="muted">
						{formatNumber(activeEvent.total_events)} events
					</Badge>
					{isFetching && !isLoading && (
						<span className="inline-flex items-center gap-1.5 text-muted-foreground text-xs">
							<ArrowClockwiseIcon className="size-3 animate-spin" />
							Updating
						</span>
					)}
				</div>
				{getEventHref && (
					<Link
						className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 font-medium text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
						href={getEventHref(activeEvent.name)}
					>
						Details
						<ArrowRightIcon className="size-3.5" />
					</Link>
				)}
			</div>

			{activeEvent.summaryProperties.length > 0 ? (
				<div className="grid min-h-64 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 xl:grid-cols-3">
					{activeEvent.summaryProperties.map((property) => (
						<PropertyCard
							eventName={activeEvent.name}
							key={property.key}
							onPropertyValueSelect={onPropertyValueSelect}
							property={property}
						/>
					))}
				</div>
			) : (
				<div className="flex min-h-64 flex-1 items-center justify-center p-6">
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
	onPropertyValueSelect?: (
		eventName: string,
		propertyKey: string,
		value: string
	) => void;
	property: ClassifiedProperty;
}

function PropertyCard({
	eventName,
	property,
	onPropertyValueSelect,
}: PropertyCardProps) {
	return (
		<PropertyValueCard
			onValueSelect={
				onPropertyValueSelect
					? (value) => onPropertyValueSelect(eventName, property.key, value)
					: undefined
			}
			title={property.key}
			typeLabel={getPropertyTypeLabel(property.classification)}
			uniqueCount={property.classification.cardinality}
			values={property.values}
		/>
	);
}

function PropertySummarySkeleton() {
	return (
		<div className="space-y-3">
			<div className="flex min-h-8 items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<div className="h-8 w-60 animate-pulse rounded-md bg-muted" />
					<div className="h-5 w-20 animate-pulse rounded-full bg-muted" />
					<div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
				</div>
				<div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
			</div>
			<div className="grid min-h-64 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 xl:grid-cols-3">
				{[1, 2, 3].map((item) => (
					<div
						className="overflow-hidden rounded-lg border border-border/60 bg-card"
						key={item}
					>
						<div className="flex min-h-11 items-center justify-between border-border/60 border-b bg-muted/30 px-3 py-2.5">
							<div className="h-4 w-20 animate-pulse rounded bg-muted" />
							<div className="h-3 w-12 animate-pulse rounded bg-muted" />
						</div>
						<div className="divide-y divide-border/60">
							{[1, 2, 3, 4].map((row) => (
								<div className="px-3 py-2.5" key={row}>
									<div className="flex items-center justify-between gap-3">
										<div className="min-w-0 flex-1 space-y-1">
											<div className="h-3 w-24 animate-pulse rounded bg-muted" />
											<div className="h-1 w-full animate-pulse rounded-full bg-muted" />
										</div>
										<div className="h-3 w-10 animate-pulse rounded bg-muted" />
									</div>
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
