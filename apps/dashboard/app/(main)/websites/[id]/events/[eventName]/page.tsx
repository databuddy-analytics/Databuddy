"use client";

import {
	CalendarBlankIcon,
	ClockIcon,
	LightningIcon,
	LinkIcon,
	TagIcon,
	UserIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { formatTime, fromNow } from "@/lib/time";
import { useEventDetailData } from "./use-event-detail";

const formatNumber = (value: number | null | undefined): string => {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
};

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
			total_events: data.trends.map((t) => ({
				date: formatDate(t.date),
				value: t.total_events ?? 0,
			})),
			unique_users: data.trends.map((t) => ({
				date: formatDate(t.date),
				value: t.unique_users ?? 0,
			})),
			unique_sessions: data.trends.map((t) => ({
				date: formatDate(t.date),
				value: t.unique_sessions ?? 0,
			})),
			unique_pages: data.trends.map((t) => ({
				date: formatDate(t.date),
				value: t.unique_pages ?? 0,
			})),
		};
	}, [data?.trends, dateRange.granularity]);

	if (error) {
		return (
			<div className="p-3 sm:p-4">
				<div className="rounded border border-destructive/20 bg-destructive/5 p-6">
					<div className="flex flex-col items-center text-center">
						<div className="mb-4 flex size-12 items-center justify-center rounded bg-destructive/10">
							<LightningIcon
								className="size-6 text-destructive"
								weight="duotone"
							/>
						</div>
						<h4 className="mb-2 font-semibold text-destructive">
							Error loading event data
						</h4>
						<p className="max-w-md text-balance text-destructive/80 text-sm">
							There was an issue loading data for this event.
						</p>
					</div>
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
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
						<StatCard
							chartData={isLoading ? undefined : miniChartData.total_events}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={LightningIcon}
							id="event-total"
							isLoading={isLoading}
							showChart
							title="Total Events"
							value={formatNumber(summary.total_events)}
						/>
						<StatCard
							chartData={isLoading ? undefined : miniChartData.unique_users}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={UserIcon}
							id="event-users"
							isLoading={isLoading}
							showChart
							title="Unique Users"
							value={formatNumber(summary.unique_users)}
						/>
						<StatCard
							chartData={isLoading ? undefined : miniChartData.unique_sessions}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={UsersIcon}
							id="event-sessions"
							isLoading={isLoading}
							showChart
							title="Sessions"
							value={formatNumber(summary.unique_sessions)}
						/>
						<StatCard
							chartData={isLoading ? undefined : miniChartData.unique_pages}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={CalendarBlankIcon}
							id="event-pages"
							isLoading={isLoading}
							showChart
							title="Unique Pages"
							value={formatNumber(summary.unique_pages)}
						/>
					</div>

					{properties.length > 0 && (
						<div className="rounded border bg-card">
							<div className="border-b px-4 py-3">
								<h3 className="font-medium text-foreground">Properties</h3>
								<p className="text-muted-foreground text-sm">
									Value distribution for each property
								</p>
							</div>
							<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
								{properties.map((prop) => (
									<PropertyCard key={prop.key} property={prop} />
								))}
							</div>
						</div>
					)}

					<div className="rounded border bg-card">
						<div className="border-b px-4 py-3">
							<h3 className="font-medium text-foreground">Recent Events</h3>
							<p className="text-muted-foreground text-sm">
								Latest occurrences of this event
							</p>
						</div>
						<div className="divide-y">
							{recentEvents.length === 0 ? (
								<div className="p-6 text-center text-muted-foreground text-sm">
									No recent events
								</div>
							) : (
								recentEvents.slice(0, 20).map((event, idx) => (
									<div
										className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
										key={`${event.timestamp}-${event.session_id}-${idx}`}
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
									View all in stream →
								</Link>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}

interface PropertyCardProps {
	property: {
		key: string;
		classification: {
			cardinality: number;
			inferred_type: string;
		};
		values: Array<{
			property_value: string;
			count: number;
			percentage: number;
		}>;
	};
}

function PropertyCard({ property }: PropertyCardProps) {
	const { classification, values } = property;
	const maxCount = Math.max(...values.map((v) => v.count), 1);

	return (
		<div className="rounded border bg-background">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<div className="flex items-center gap-2">
					<TagIcon
						className="size-3.5 text-muted-foreground"
						weight="duotone"
					/>
					<span className="font-medium text-foreground text-sm">
						{property.key}
					</span>
				</div>
				<span className="text-muted-foreground text-xs tabular-nums">
					{classification.cardinality} unique
				</span>
			</div>
			<div className="max-h-[160px] overflow-y-auto p-1.5">
				{values.slice(0, 10).map((value, idx) => {
					const barWidth = (value.count / maxCount) * 100;
					return (
						<div
							className="group relative flex items-center gap-2 rounded px-2 py-1.5"
							key={`${value.property_value}-${idx}`}
						>
							<div
								className="absolute inset-y-0 left-0 rounded bg-primary/8"
								style={{ width: `${barWidth}%` }}
							/>
							<div className="relative z-10 flex min-w-0 flex-1 items-center justify-between gap-2">
								<span
									className="truncate text-foreground text-sm"
									title={value.property_value}
								>
									{value.property_value || "(empty)"}
								</span>
								<div className="flex shrink-0 items-center gap-2">
									<span className="text-muted-foreground text-xs tabular-nums">
										{formatNumber(value.count)}
									</span>
									<span className="w-10 text-right text-muted-foreground/60 text-xs tabular-nums">
										{value.percentage.toFixed(0)}%
									</span>
								</div>
							</div>
						</div>
					);
				})}
				{values.length > 10 && (
					<div className="mt-1 border-t pt-2 text-center text-muted-foreground/60 text-xs">
						+{values.length - 10} more values
					</div>
				)}
			</div>
		</div>
	);
}

function EventDetailSkeleton() {
	return (
		<div className="space-y-3 sm:space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<div className="rounded border bg-card p-3 sm:p-4" key={`stat-${i}`}>
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="size-8 rounded" />
						</div>
						<Skeleton className="mt-2 h-8 w-24" />
						<Skeleton className="mt-3 h-16 w-full" />
					</div>
				))}
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-4 py-3">
					<Skeleton className="h-5 w-24" />
					<Skeleton className="mt-1 h-3 w-40" />
				</div>
				<div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }).map((_, i) => (
						<div className="rounded border bg-background" key={`prop-${i}`}>
							<div className="flex items-center justify-between border-b px-3 py-2">
								<Skeleton className="h-4 w-16" />
								<Skeleton className="h-3 w-12" />
							</div>
							<div className="space-y-1.5 p-1.5">
								{Array.from({ length: 4 }).map((_, j) => (
									<div
										className="flex items-center justify-between px-2 py-1.5"
										key={`val-${j}`}
									>
										<Skeleton className="h-4 w-20" />
										<Skeleton className="h-3 w-12" />
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-4 py-3">
					<Skeleton className="h-5 w-28" />
					<Skeleton className="mt-1 h-3 w-44" />
				</div>
				<div className="divide-y">
					{Array.from({ length: 5 }).map((_, i) => (
						<div
							className="flex items-start gap-3 px-4 py-3"
							key={`event-${i}`}
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
			</div>
		</div>
	);
}
