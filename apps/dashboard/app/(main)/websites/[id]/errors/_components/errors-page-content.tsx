"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { BugIcon } from "@phosphor-icons/react/dist/ssr/Bug";
import { useAtomValue } from "jotai";
import { use } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { Skeleton } from "@/components/ui/skeleton";
import { useDateFilters } from "@/hooks/use-date-filters";
import { formatDateOnly } from "@/lib/formatters";
import { isAnalyticsRefreshingAtom } from "@/stores/jotai/filterAtoms";
import { useEnhancedErrorData } from "../use-errors";
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

	const isRefreshing = useAtomValue(isAnalyticsRefreshingAtom);
	const { dateRange } = useDateFilters();

	const {
		results: errorResults,
		isLoading,
		error,
	} = useEnhancedErrorData(websiteId, dateRange, {
		queryKey: ["enhancedErrorData", websiteId, dateRange],
	});

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
			<div className="p-3 sm:p-4">
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
			<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
				{isLoading ? (
					<ErrorsLoadingSkeleton />
				) : (
					<>
						<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
							<div className="lg:col-span-2">
								<ErrorTrendsChart errorChartData={processedChartData} />
							</div>
							<div className="flex flex-col gap-3 sm:gap-4">
								<ErrorSummaryStats errorSummary={errorSummary} />
								<TopErrorCard topError={topError} />
							</div>
						</div>

						<RecentErrorsTable recentErrors={recentErrors} />

						<ErrorDataTable
							isLoading={isLoading}
							isRefreshing={isRefreshing}
							processedData={{
								error_types: errorTypes,
								errors_by_page: errorsByPage,
							}}
						/>
					</>
				)}
			</div>
		</FeatureGate>
	);
};

function ErrorsLoadingSkeleton() {
	return (
		<div className="space-y-3 sm:space-y-4">
			<div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-3">
				<div className="lg:col-span-2">
					<div className="rounded border bg-card">
						<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
							<Skeleton className="size-8 rounded" />
							<div className="space-y-1">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-3 w-32" />
							</div>
						</div>
						<Skeleton className="h-[320px] w-full" />
					</div>
				</div>

				<div className="flex flex-col gap-3 sm:gap-4">
					<div className="grid grid-cols-2 gap-2">
						{Array.from({ length: 4 }).map((_, i) => (
							<div
								className="rounded border bg-card"
								key={`stat-skeleton-${i + 1}`}
							>
								<div className="flex items-center gap-2.5 px-2.5 py-2.5">
									<Skeleton className="size-7 shrink-0 rounded" />
									<div className="min-w-0 flex-1 space-y-0.5">
										<Skeleton className="h-5 w-14" />
										<Skeleton className="h-3 w-12" />
									</div>
								</div>
							</div>
						))}
					</div>

					<div className="flex-1 rounded border bg-card">
						<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
							<Skeleton className="size-8 rounded" />
							<div className="space-y-1">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-24" />
							</div>
						</div>
						<div className="p-3 sm:p-4">
							<Skeleton className="h-16 w-full" />
						</div>
					</div>
				</div>
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<Skeleton className="h-5 w-28" />
				</div>
				<div className="p-3 sm:p-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>

			<div className="rounded border bg-card">
				<div className="border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<Skeleton className="h-5 w-24" />
				</div>
				<div className="p-3 sm:p-4">
					<Skeleton className="h-64 w-full" />
				</div>
			</div>
		</div>
	);
}
