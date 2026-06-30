"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import {
	EventsStatsGrid,
	PropertyValueCard,
	type CustomEventsMetricKey,
} from "@/components/events/custom-events";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useEventDetailData } from "./use-event-detail";
import { ClockIcon, LightningIcon, LinkIcon } from "@databuddy/ui/icons";
import { Card, EmptyState, Skeleton, formatTime, fromNow } from "@databuddy/ui";

const EVENT_DETAIL_METRICS: CustomEventsMetricKey[] = [
	"total_events",
	"unique_users",
	"unique_sessions",
	"unique_pages",
];

export default function EventDetailPage() {
	const params = useParams();
	const websiteId = params.id as string;
	const eventNameEncoded = params.eventName as string;

	if (!(websiteId && eventNameEncoded)) {
		notFound();
	}

	const eventName = decodeURIComponent(eventNameEncoded);

	const { chartType, chartStepType } = useChartPreferences("events");
	const { dateRange } = useDateFilters();

	const { data, isLoading, error } = useEventDetailData(
		websiteId,
		eventName,
		dateRange
	);

	const miniChartData = useMemo(() => {
		if (!data?.trends) {
			return {
				total_events: [],
				unique_users: [],
				unique_sessions: [],
				unique_pages: [],
			};
		}
		const formatDate = (date: string) =>
			dateRange.granularity === "hourly" ? date : date.slice(0, 10);

		return {
			total_events: data.trends.map((trend) => ({
				date: formatDate(trend.date),
				value: trend.total_events ?? 0,
			})),
			unique_users: data.trends.map((trend) => ({
				date: formatDate(trend.date),
				value: trend.unique_users ?? 0,
			})),
			unique_sessions: data.trends.map((trend) => ({
				date: formatDate(trend.date),
				value: trend.unique_sessions ?? 0,
			})),
			unique_pages: data.trends.map((trend) => ({
				date: formatDate(trend.date),
				value: trend.unique_pages ?? 0,
			})),
		};
	}, [data?.trends, dateRange.granularity]);

	if (error) {
		return (
			<div className="p-3 sm:p-4">
				<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
					<EmptyState
						description="There was an issue loading data for this event."
						icon={<LightningIcon />}
						title="Error loading event data"
						variant="error"
					/>
				</div>
			</div>
		);
	}

	const summary = data?.summary ?? {
		total_events: 0,
		unique_users: 0,
		unique_sessions: 0,
		unique_pages: 0,
	};
	const metricSummary = {
		...summary,
		unique_event_types: summary.total_events > 0 ? 1 : 0,
	};
	const metricChartData = {
		...miniChartData,
		unique_event_types: [],
	};
	const recentEvents = data?.recentEvents ?? [];
	const properties = data?.classifiedProperties ?? [];

	return (
		<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
			{isLoading ? (
				<EventDetailSkeleton />
			) : summary.total_events === 0 ? (
				<div className="flex flex-1 items-center justify-center py-16">
					<EmptyState
						description="This event has no data in the selected time range."
						icon={<LightningIcon />}
						title={`No events found for "${eventName}"`}
						variant="minimal"
					/>
				</div>
			) : (
				<>
					<EventsStatsGrid
						chartStepType={chartStepType}
						chartType={chartType}
						isLoading={isLoading}
						metricKeys={EVENT_DETAIL_METRICS}
						miniChartData={metricChartData}
						summary={metricSummary}
						todayEvents={0}
						todayUsers={0}
					/>

					{properties.length > 0 && (
						<div className="grid gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2 xl:grid-cols-3">
							{properties.map((property) => (
								<PropertyValueCard
									key={property.key}
									maxVisibleValues={10}
									title={property.key}
									uniqueCount={property.classification.cardinality}
									values={property.values}
								/>
							))}
						</div>
					)}

					<Card>
						<Card.Header>
							<Card.Title>Recent Events</Card.Title>
							<Card.Description>
								Latest occurrences of this event
							</Card.Description>
						</Card.Header>
						<div className="divide-y">
							{recentEvents.length === 0 ? (
								<div className="p-6 text-center text-muted-foreground text-sm">
									No recent events
								</div>
							) : (
								recentEvents.slice(0, 20).map((event, index) => (
									<div
										className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
										key={`${event.timestamp}-${event.session_id}-${index}`}
									>
										<div className="flex shrink-0 flex-col items-center text-muted-foreground">
											<ClockIcon className="size-4" weight="duotone" />
										</div>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="text-foreground text-sm">
													{fromNow(event.timestamp)}
												</span>
												<span className="text-muted-foreground/40 text-xs">
													{formatTime(event.timestamp)}
												</span>
											</div>
											{event.path && (
												<div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
													<LinkIcon className="size-3" />
													<span className="truncate">{event.path}</span>
												</div>
											)}
											{Object.keys(event.properties).length > 0 && (
												<div className="mt-1.5 flex flex-wrap gap-1">
													{Object.entries(event.properties)
														.slice(0, 4)
														.map(([key, value]) => (
															<span
																className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs"
																key={key}
															>
																<span className="text-secondary-foreground/70">
																	{key}:
																</span>
																<span className="max-w-[100px] truncate text-secondary-foreground">
																	{String(value)}
																</span>
															</span>
														))}
													{Object.keys(event.properties).length > 4 && (
														<span className="text-muted-foreground text-xs">
															+{Object.keys(event.properties).length - 4} more
														</span>
													)}
												</div>
											)}
										</div>
									</div>
								))
							)}
						</div>
						{recentEvents.length > 20 && (
							<div className="border-t px-4 py-2 text-center">
								<Link
									className="text-primary text-sm hover:underline"
									href={`/websites/${websiteId}/events/stream?event=${encodeURIComponent(eventName)}`}
								>
									View all in stream
								</Link>
							</div>
						)}
					</Card>
				</>
			)}
		</div>
	);
}

function EventDetailSkeleton() {
	return (
		<div className="space-y-3 sm:space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, index) => (
					<div
						className="rounded border border-border/60 bg-card p-3 sm:p-4"
						key={`stat-${index}`}
					>
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="size-8 rounded" />
						</div>
						<Skeleton className="mt-2 h-8 w-24" />
						<Skeleton className="mt-3 h-16 w-full" />
					</div>
				))}
			</div>

			<Card>
				<Card.Header>
					<Skeleton className="h-5 w-24" />
					<Skeleton className="h-3 w-40" />
				</Card.Header>
				<Card.Content className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }).map((_, index) => (
						<div
							className="rounded-lg border border-border/60 bg-background"
							key={`prop-${index}`}
						>
							<div className="flex items-center justify-between border-border/60 border-b px-3 py-2">
								<Skeleton className="h-4 w-16" />
								<Skeleton className="h-3 w-12" />
							</div>
							<div className="space-y-1.5 p-1.5">
								{Array.from({ length: 4 }).map((_, row) => (
									<div
										className="flex items-center justify-between px-2 py-1.5"
										key={`value-${row}`}
									>
										<Skeleton className="h-4 w-20" />
										<Skeleton className="h-3 w-12" />
									</div>
								))}
							</div>
						</div>
					))}
				</Card.Content>
			</Card>

			<Card>
				<Card.Header>
					<Skeleton className="h-5 w-28" />
					<Skeleton className="h-3 w-44" />
				</Card.Header>
				<div className="divide-y">
					{Array.from({ length: 5 }).map((_, index) => (
						<div
							className="flex items-start gap-3 px-4 py-3"
							key={`event-${index}`}
						>
							<Skeleton className="size-4 rounded" />
							<div className="flex-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="mt-1 h-3 w-32" />
								<div className="mt-1.5 flex gap-1">
									<Skeleton className="h-5 w-16 rounded" />
									<Skeleton className="h-5 w-20 rounded" />
								</div>
							</div>
						</div>
					))}
				</div>
			</Card>
		</div>
	);
}
