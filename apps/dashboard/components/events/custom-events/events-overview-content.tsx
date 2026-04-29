"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { ReactNode } from "react";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { cn } from "@/lib/utils";
import { ArrowClockwiseIcon, LightningIcon } from "@databuddy/ui/icons";
import { EventsStatsGrid } from "./events-stats-grid";
import { EventsTrendChart } from "./events-trend-chart";
import { PropertySummary } from "./property-summary";
import { useCustomEventsOverview } from "./use-custom-events-overview";
import type { CustomEventsMetricKey } from "./types";
import { Card, EmptyState, Skeleton } from "@databuddy/ui";

interface CustomEventsQueryState {
	error?: Error | null;
	isFetching: boolean;
	isLoading: boolean;
	isPropertiesLoading?: boolean;
	results?: Array<{
		data?: Record<string, unknown>;
		queryId?: string;
	}>;
}

interface EventsOverviewContentProps {
	className?: string;
	dateRange: DateRange;
	emptyDescription?: ReactNode;
	getEventHref?: (eventName: string) => string;
	isPageLoading?: boolean;
	metricKeys: CustomEventsMetricKey[];
	onPropertyValueSelect?: (
		eventName: string,
		propertyKey: string,
		value: string
	) => void;
	query: CustomEventsQueryState;
}

export function EventsOverviewContent({
	className,
	dateRange,
	emptyDescription,
	getEventHref,
	isPageLoading: isPageShellLoading = false,
	metricKeys,
	onPropertyValueSelect,
	query,
}: EventsOverviewContentProps) {
	const { chartType, chartStepType } = useChartPreferences("events");
	const overview = useCustomEventsOverview({
		dateRange,
		results: query.results,
	});
	const isPageLoading = isPageShellLoading || query.isLoading;

	if (query.error) {
		return (
			<div className="p-3 sm:p-4">
				<div className="rounded-lg border border-destructive/20 bg-destructive/5 p-6">
					<EmptyState
						description="There was an issue loading your events analytics. Please try refreshing using the toolbar above."
						icon={<LightningIcon />}
						title="Error loading data"
						variant="error"
					/>
				</div>
			</div>
		);
	}

	const showRefreshingIndicator = query.isFetching && !query.isLoading;

	return (
		<div className={cn("space-y-3 p-3 sm:space-y-4 sm:p-4", className)}>
			{showRefreshingIndicator && (
				<div className="flex h-9 items-center justify-center gap-2 rounded-md border border-primary/20 bg-primary/5 text-primary text-sm">
					<ArrowClockwiseIcon className="size-4 animate-spin" />
					<span>Refreshing data...</span>
				</div>
			)}

			{isPageLoading ? (
				<EventsOverviewSkeleton metricCount={metricKeys.length} />
			) : overview.summary.total_events === 0 ? (
				<div className="flex flex-1 items-center justify-center py-16">
					<EmptyState
						description={
							emptyDescription ?? (
								<>
									Events will appear here once your tracker starts collecting
									them. Use{" "}
									<code className="rounded bg-muted px-1 py-0.5 text-xs">
										databuddy.track()
									</code>{" "}
									to send custom events.
								</>
							)
						}
						icon={<LightningIcon />}
						title="No events yet"
						variant="minimal"
					/>
				</div>
			) : (
				<>
					<EventsStatsGrid
						chartStepType={chartStepType}
						chartType={chartType}
						isLoading={isPageLoading}
						metricKeys={metricKeys}
						miniChartData={overview.miniChartData}
						summary={overview.summary}
						todayEvents={overview.todayEvents}
						todayUsers={overview.todayUsers}
					/>

					<EventsTrendChart
						chartData={overview.chartData}
						eventNames={overview.perEventChartData.eventNames}
						isFetching={query.isFetching}
						isLoading={isPageLoading}
						perEventData={overview.perEventChartData.data}
					/>

					<PropertySummary
						events={overview.classifiedEvents}
						getEventHref={getEventHref}
						isFetching={query.isFetching}
						isLoading={isPageLoading || query.isPropertiesLoading}
						onPropertyValueSelect={onPropertyValueSelect}
					/>
				</>
			)}
		</div>
	);
}

function EventsOverviewSkeleton({ metricCount }: { metricCount: number }) {
	return (
		<div className="space-y-3 sm:space-y-4">
			<div
				className={cn(
					"grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2",
					metricCount >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4"
				)}
			>
				{Array.from({ length: metricCount }).map((_, index) => (
					<div
						className="rounded-lg border border-border/60 bg-card p-3 sm:p-4"
						key={`stat-${index}`}
					>
						<div className="flex items-center justify-between">
							<Skeleton className="h-4 w-20" />
							<Skeleton className="size-8 rounded" />
						</div>
						<Skeleton className="mt-2 h-8 w-24" />
						<Skeleton className="mt-1 h-3 w-16" />
						<Skeleton className="mt-3 h-16 w-full" />
					</div>
				))}
			</div>

			<Card>
				<Card.Header>
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-3 w-24" />
				</Card.Header>
				<Skeleton className="h-[320px] w-full rounded-none" />
			</Card>

			<Card>
				<Card.Header>
					<Skeleton className="h-5 w-36" />
					<Skeleton className="h-3 w-48" />
				</Card.Header>
				<Card.Content>
					<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
						{Array.from({ length: 3 }).map((_, index) => (
							<div
								className="rounded-lg border border-border/60 bg-background p-3"
								key={`property-${index}`}
							>
								<div className="mb-3 flex items-center justify-between">
									<Skeleton className="h-4 w-20" />
									<Skeleton className="h-3 w-12" />
								</div>
								<div className="space-y-2">
									{Array.from({ length: 4 }).map((_, row) => (
										<div
											className="flex items-center justify-between"
											key={`property-${index}-${row}`}
										>
											<Skeleton className="h-4 w-24" />
											<Skeleton className="h-3 w-12" />
										</div>
									))}
								</div>
							</div>
						))}
					</div>
				</Card.Content>
			</Card>
		</div>
	);
}
