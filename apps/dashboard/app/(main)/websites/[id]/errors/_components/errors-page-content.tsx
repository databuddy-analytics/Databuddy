"use client";

import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { useAtom, useAtomValue } from "jotai";
import { use, useCallback } from "react";
import { FeatureGate } from "@/components/feature-gate";
import { useDateFilters } from "@/hooks/use-date-filters";
import {
	type DynamicQueryFilter,
	dynamicQueryFiltersAtom,
	isAnalyticsRefreshingAtom,
} from "@/stores/jotai/filterAtoms";
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
import { BugIcon } from "@databuddy/ui/icons";
import { EmptyState, formatDateOnly } from "@databuddy/ui";

interface ErrorsPageContentProps {
	params: Promise<{ id: string }>;
}

const EMPTY_SUMMARY: ErrorSummary = {
	totalErrors: 0,
	uniqueErrorTypes: 0,
	affectedUsers: 0,
	affectedSessions: 0,
	errorRate: 0,
};

export const ErrorsPageContent = ({ params }: ErrorsPageContentProps) => {
	const { id: websiteId } = use(params);

	const isRefreshing = useAtomValue(isAnalyticsRefreshingAtom);
	const [filters, setFilters] = useAtom(dynamicQueryFiltersAtom);
	const { dateRange } = useDateFilters();

	const onAddFilter = useCallback(
		(field: string, value: string) => {
			const newFilter: DynamicQueryFilter = { field, operator: "eq", value };
			const withoutSameField = filters.filter((f) => f.field !== field);
			setFilters([...withoutSameField, newFilter]);
		},
		[filters, setFilters]
	);

	const {
		results: errorResults,
		isLoading,
		error,
	} = useEnhancedErrorData(websiteId, dateRange, {
		filters,
		queryKey: ["enhancedErrorData", websiteId, dateRange, filters],
	});

	const getData = <T,>(id: string): T[] =>
		(errorResults?.find(
			(r: { queryId: string; data?: Record<string, unknown> }) =>
				r.queryId === id
		)?.data?.[id] as T[]) || [];

	const recentErrors = getData<RecentError>("recent_errors");
	const errorTypes = getData<ErrorType>("error_types");
	const errorsByPage = getData<ErrorByPage>("errors_by_page");
	const errorSummary =
		getData<ErrorSummary>("error_summary")[0] ?? EMPTY_SUMMARY;
	const topError = errorTypes[0] || null;
	const processedChartData: ProcessedChartData[] = getData<ErrorChartData>(
		"error_chart_data"
	).map((point) => ({
		date: formatDateOnly(point.date),
		"Total Errors": point.totalErrors || 0,
		"Affected Users": point.affectedUsers || 0,
	}));

	if (error) {
		return (
			<div className="p-3 sm:p-4">
				<EmptyState
					description="Try refreshing from the toolbar above."
					icon={<BugIcon />}
					title="Failed to load errors"
					variant="error"
				/>
			</div>
		);
	}

	return (
		<FeatureGate feature={GATED_FEATURES.ERROR_TRACKING}>
			<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
				<div className="grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 lg:grid-cols-3">
					<div className="lg:col-span-2">
						<ErrorTrendsChart
							errorChartData={processedChartData}
							isLoading={isLoading}
						/>
					</div>
					<div className="flex flex-col gap-3 sm:gap-4">
						<ErrorSummaryStats
							errorSummary={errorSummary}
							isLoading={isLoading}
						/>
						<TopErrorCard isLoading={isLoading} topError={topError} />
					</div>
				</div>

				<RecentErrorsTable isLoading={isLoading} recentErrors={recentErrors} />

				<ErrorDataTable
					isLoading={isLoading}
					isRefreshing={isRefreshing}
					onAddFilter={onAddFilter}
					processedData={{
						error_types: errorTypes,
						errors_by_page: errorsByPage,
					}}
				/>
			</div>
		</FeatureGate>
	);
};
