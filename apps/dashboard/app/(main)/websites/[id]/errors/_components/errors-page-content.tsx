"use client";

import { BugIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { use, useCallback, useEffect } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { GATED_FEATURES } from "@/components/providers/billing-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useEnhancedErrorData } from "@/hooks/use-dynamic-query";
import { formatDateOnly } from "@/lib/formatters";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { ErrorDataTable } from "./error-data-table";
import { ErrorSummaryStats } from "./error-summary-stats";
import { ErrorTrendsChart } from "./error-trends-chart";
import { RecentErrorsTable } from "./recent-errors-table";
import { TopErrorCard } from "./top-error-card";
import type {
	ErrorByPage,
	ErrorChartData,
	ErrorSummary,
	ErrorType,
	ProcessedChartData,
	RecentError,
} from "./types";

interface ErrorsPageContentProps {
	params: Promise<{ id: string }>;
}

export const ErrorsPageContent = ({ params }: ErrorsPageContentProps) => {
	const resolvedParams = use(params);
	const websiteId = resolvedParams.id;

	const [isRefreshing, setIsRefreshing] = useAtom(isAnalyticsRefreshingAtom);
	const { dateRange } = useDateFilters();

	const {
		results: errorResults,
		isLoading,
		refetch,
		error,
	} = useEnhancedErrorData(websiteId, dateRange, {
		queryKey: ["enhancedErrorData", websiteId, dateRange],
	});

	const handleRefresh = useCallback(async () => {
		if (isRefreshing) {
			try {
				await refetch();
			} finally {
				setIsRefreshing(false);
			}
		}
	}, [isRefreshing, refetch, setIsRefreshing]);

	useEffect(() => {
		handleRefresh();
	}, [handleRefresh]);

	const getData = <T,>(id: string): T[] =>
		(errorResults?.find((r) => r.queryId === id)?.data?.[id] as T[]) || [];

	const recentErrors = getData<RecentError>("recent_errors");
	const errorTypes = getData<ErrorType>("error_types");
	const errorsByPage = getData<ErrorByPage>("errors_by_page");
	const errorSummaryData = getData<ErrorSummary>("error_summary");
	const errorChartData = getData<ErrorChartData>("error_chart_data");

	const errorSummary = errorSummaryData[0] || {
		totalErrors: 0,
		uniqueErrorTypes: 0,
		affectedUsers: 0,
		affectedSessions: 0,
		errorRate: 0,
	};

	const topError = errorTypes[0] || null;
	const processedChartData: ProcessedChartData[] = errorChartData.map(
		(point) => ({
			date: formatDateOnly(point.date),
			"Total Errors": point.totalErrors || 0,
			"Affected Users": point.affectedUsers || 0,
		})
	);

	if (error) {
		return (
			<div className="p-4">
				<div className="rounded border border-destructive/20 bg-destructive/5 p-6">
					<div className="flex flex-col items-center text-center">
						<div className="mb-4 flex size-12 items-center justify-center rounded bg-destructive/10">
							<BugIcon className="size-6 text-destructive" weight="duotone" />
						</div>
						<h4 className="mb-2 font-semibold text-destructive">
							Error loading data
						</h4>
						<p className="max-w-md text-destructive/80 text-sm">
							There was an issue loading your error analytics. Please try
							refreshing using the toolbar above.
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<FeatureGate feature={GATED_FEATURES.ERROR_TRACKING}>
			<div className="space-y-4 p-4">
				{isLoading ? (
					<ErrorsLoadingSkeleton />
				) : (
					<div className="space-y-4">
						{/* Main Grid - Chart + Stats */}
						<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
							<div className="lg:col-span-2">
								<ErrorTrendsChart errorChartData={processedChartData} />
							</div>
							<div className="flex flex-col gap-4">
								<ErrorSummaryStats errorSummary={errorSummary} />
								<TopErrorCard topError={topError} />
							</div>
						</div>

						{/* Recent Errors */}
						<RecentErrorsTable recentErrors={recentErrors} />

						{/* Detailed Tables */}
						<ErrorDataTable
							isLoading={isLoading}
							isRefreshing={isRefreshing}
							processedData={{
								error_types: errorTypes,
								errors_by_page: errorsByPage,
							}}
						/>
					</div>
				)}
			</div>
		</FeatureGate>
	);
};

function ErrorsLoadingSkeleton() {
	return (
		<div className="space-y-4">
			{/* Chart and summary stats grid */}
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
				{/* Error trends chart skeleton */}
				<div className="lg:col-span-2">
					<div className="overflow-hidden rounded border bg-card p-4">
						<Skeleton className="h-[400px] w-full" />
					</div>
				</div>

				{/* Summary stats and top error card */}
				<div className="flex flex-col gap-4">
					{/* Error summary stats skeleton */}
					<div className="grid grid-cols-2 gap-2">
						{[1, 2, 3, 4].map((num) => (
							<div
								className="overflow-hidden rounded border border-border bg-card"
								key={`summary-skeleton-${num}`}
							>
								<div className="flex items-center gap-3 p-3">
									<Skeleton className="size-8 rounded" />
									<div className="space-y-1.5">
										<Skeleton className="h-5 w-12" />
										<Skeleton className="h-3 w-16" />
									</div>
								</div>
								<div className="border-border/50 border-t bg-accent/30 px-3 py-1.5">
									<Skeleton className="h-2.5 w-24" />
								</div>
							</div>
						))}
					</div>

					{/* Top error card skeleton */}
					<div className="overflow-hidden rounded border border-border bg-card">
						<div className="flex items-center gap-3 border-border/50 border-b p-4">
							<Skeleton className="size-8 rounded" />
							<div className="space-y-1.5">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-24" />
							</div>
							<Skeleton className="ml-auto h-5 w-16 rounded" />
						</div>
						<div className="space-y-3 p-4">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-3/4" />
							<Skeleton className="h-10 w-full rounded" />
						</div>
						<div className="grid grid-cols-2 gap-2 border-border/50 border-t bg-accent/20 p-3">
							<Skeleton className="h-14 rounded" />
							<Skeleton className="h-14 rounded" />
						</div>
					</div>
				</div>
			</div>

			{/* Recent errors table skeleton */}
			<div className="overflow-hidden rounded border border-border bg-card">
				<div className="border-border/50 border-b p-4">
					<div className="space-y-1.5">
						<Skeleton className="h-5 w-28" />
						<Skeleton className="h-3 w-40" />
					</div>
				</div>
				<div className="space-y-2 p-4">
					{[1, 2, 3, 4, 5].map((rowNum) => (
						<div
							className="flex items-center justify-between rounded border border-border/50 bg-accent/10 p-3"
							key={`recent-error-skeleton-${rowNum}`}
						>
							<div className="flex items-center gap-3">
								<Skeleton className="size-5 rounded" />
								<div className="space-y-1.5">
									<Skeleton className="h-4 w-48" />
									<Skeleton className="h-3 w-32" />
								</div>
							</div>
							<div className="flex items-center gap-3">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-5 w-14 rounded" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Error data table skeleton */}
			<div className="overflow-hidden rounded border border-border bg-card">
				<div className="border-border/50 border-b p-4">
					<div className="space-y-1.5">
						<Skeleton className="h-5 w-24" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
				<div className="space-y-2 p-4">
					{[1, 2, 3, 4, 5, 6].map((rowNum) => (
						<div
							className="flex items-center justify-between rounded border border-border/50 bg-accent/10 p-3"
							key={`error-data-skeleton-${rowNum}`}
						>
							<div className="flex items-center gap-3">
								<Skeleton className="size-4 rounded" />
								<Skeleton className="h-4 w-40" />
							</div>
							<div className="flex items-center gap-3">
								<Skeleton className="h-4 w-12" />
								<Skeleton className="h-4 w-12" />
								<Skeleton className="h-5 w-12 rounded" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
