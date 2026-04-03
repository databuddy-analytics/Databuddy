"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatTokenCount } from "../_lib/llm-analytics-utils";
import {
	createErrorColumns,
	createHttpStatusColumns,
	createRecentErrorColumns,
	type LlmErrorBreakdownRow,
	type LlmHttpStatusRow,
	type LlmRecentErrorRow,
} from "./llm-columns";

interface LlmErrorsTabProps {
	dateRange: DateRange;
	websiteId: string;
}

interface LlmErrorRateSeriesRow {
	date: string;
	error_count: number;
	error_rate: number;
}

export function LlmErrorsTab({ websiteId, dateRange }: LlmErrorsTabProps) {
	const queries: DynamicQueryRequest[] = [
		{ id: "llm-error-series", parameters: ["llm_error_rate_time_series"] },
		{ id: "llm-errors", parameters: ["llm_error_breakdown"] },
		{ id: "llm-status", parameters: ["llm_http_status_breakdown"] },
		{ id: "llm-recent-errors", parameters: ["llm_recent_errors"] },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const errorSeries =
		(getDataForQuery(
			"llm-error-series",
			"llm_error_rate_time_series"
		) as LlmErrorRateSeriesRow[]) ?? [];

	const errorBreakdown =
		(getDataForQuery(
			"llm-errors",
			"llm_error_breakdown"
		) as LlmErrorBreakdownRow[]) ?? [];
	const statusBreakdown =
		(getDataForQuery(
			"llm-status",
			"llm_http_status_breakdown"
		) as LlmHttpStatusRow[]) ?? [];

	const recentErrors =
		(
			getDataForQuery(
				"llm-recent-errors",
				"llm_recent_errors"
			) as LlmRecentErrorRow[]
		)?.map((row) => ({
			...row,
			name: row.error_name,
		})) ?? [];

	const errorChart = useMemo(
		() =>
			errorSeries.map((row) => ({
				date: row.date,
				errors: row.error_count ?? 0,
				rate: (row.error_rate ?? 0) * 100,
			})),
		[errorSeries]
	);

	const breakdownTabs = useMemo(() => {
		const tabs: TabConfig<LlmErrorBreakdownRow | LlmHttpStatusRow>[] = [];

		if (errorBreakdown.length > 0) {
			tabs.push({
				id: "errors",
				label: "Errors",
				data: errorBreakdown,
				columns: createErrorColumns(),
			});
		}

		if (statusBreakdown.length > 0) {
			tabs.push({
				id: "http-status",
				label: "HTTP Status",
				data: statusBreakdown,
				columns: createHttpStatusColumns(),
			});
		}

		return tabs;
	}, [errorBreakdown, statusBreakdown]);

	return (
		<div className="space-y-4">
			<SimpleMetricsChart
				data={errorChart}
				description="Errors and error rate over time"
				height={240}
				isLoading={isLoading}
				metrics={[
					{
						key: "errors",
						label: "Errors",
						color: "#ef4444",
						formatValue: (value) => formatTokenCount(value),
					},
					{
						key: "rate",
						label: "Error Rate",
						color: "#f59e0b",
						formatValue: (value) => {
							const safeValue =
								value == null || Number.isNaN(value) ? 0 : value;
							return `${safeValue.toFixed(1)}%`;
						},
					},
				]}
				title="Error Trends"
			/>

			{breakdownTabs.length > 0 && (
				<DataTable
					description="Breakdowns by error type and HTTP status"
					isLoading={isLoading}
					tabs={breakdownTabs}
					title="Breakdowns"
				/>
			)}

			<DataTable
				columns={createRecentErrorColumns()}
				data={recentErrors}
				description="Latest error instances"
				isLoading={isLoading}
				title="Recent Errors"
			/>
		</div>
	);
}
