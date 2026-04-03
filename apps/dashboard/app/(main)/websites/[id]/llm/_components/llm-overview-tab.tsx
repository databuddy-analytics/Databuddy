"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { addDynamicFilterAtom } from "@/stores/jotai/filterAtoms";
import {
	formatDurationMs,
	formatTokenCount,
	formatUsd,
} from "../_lib/llm-analytics-utils";
import {
	createErrorColumns,
	createFinishReasonColumns,
	createModelColumns,
	createProviderColumns,
	type LlmErrorBreakdownRow,
	type LlmFinishReasonRow,
	type LlmModelBreakdownRow,
	type LlmProviderBreakdownRow,
} from "./llm-columns";

interface LlmOverviewTabProps {
	dateRange: DateRange;
	websiteId: string;
}

interface LlmTimeSeriesRow {
	avg_duration_ms: number;
	date: string;
	p75_duration_ms: number;
	total_calls: number;
	total_cost: number;
	total_tokens: number;
}

export function LlmOverviewTab({ websiteId, dateRange }: LlmOverviewTabProps) {
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const queries: DynamicQueryRequest[] = [
		{ id: "llm-series", parameters: ["llm_time_series"] },
		{ id: "llm-provider", parameters: ["llm_provider_breakdown"] },
		{ id: "llm-model", parameters: ["llm_model_breakdown"] },
		{ id: "llm-finish", parameters: ["llm_finish_reason_breakdown"] },
		{ id: "llm-errors", parameters: ["llm_error_breakdown"] },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const timeSeries =
		(getDataForQuery("llm-series", "llm_time_series") as LlmTimeSeriesRow[]) ??
		[];

	const providerBreakdown =
		(getDataForQuery(
			"llm-provider",
			"llm_provider_breakdown"
		) as LlmProviderBreakdownRow[]) ?? [];
	const modelBreakdown =
		(getDataForQuery(
			"llm-model",
			"llm_model_breakdown"
		) as LlmModelBreakdownRow[]) ?? [];
	const finishReasonBreakdown =
		(getDataForQuery(
			"llm-finish",
			"llm_finish_reason_breakdown"
		) as LlmFinishReasonRow[]) ?? [];
	const errorBreakdown =
		(getDataForQuery(
			"llm-errors",
			"llm_error_breakdown"
		) as LlmErrorBreakdownRow[]) ?? [];

	const callsSeries = useMemo(
		() =>
			timeSeries.map((row) => ({
				date: row.date,
				calls: row.total_calls ?? 0,
			})),
		[timeSeries]
	);

	const costSeries = useMemo(
		() =>
			timeSeries.map((row) => ({
				date: row.date,
				cost: row.total_cost ?? 0,
			})),
		[timeSeries]
	);

	const latencySeries = useMemo(
		() =>
			timeSeries.map((row) => ({
				date: row.date,
				avg: row.avg_duration_ms ?? 0,
				p75: row.p75_duration_ms ?? 0,
			})),
		[timeSeries]
	);

	const breakdownTabs = useMemo(() => {
		const tabs: TabConfig<
			| LlmProviderBreakdownRow
			| LlmModelBreakdownRow
			| LlmFinishReasonRow
			| LlmErrorBreakdownRow
		>[] = [];

		if (providerBreakdown.length > 0) {
			tabs.push({
				id: "providers",
				label: "Providers",
				data: providerBreakdown,
				columns: createProviderColumns(),
				getFilter: (row) => ({ field: "provider", value: row.name }),
			});
		}

		if (modelBreakdown.length > 0) {
			tabs.push({
				id: "models",
				label: "Models",
				data: modelBreakdown,
				columns: createModelColumns(),
				getFilter: (row) => ({ field: "model", value: row.name }),
			});
		}

		if (finishReasonBreakdown.length > 0) {
			tabs.push({
				id: "finish",
				label: "Finish Reasons",
				data: finishReasonBreakdown,
				columns: createFinishReasonColumns(),
				getFilter: (row) => ({ field: "finish_reason", value: row.name }),
			});
		}

		if (errorBreakdown.length > 0) {
			tabs.push({
				id: "errors",
				label: "Errors",
				data: errorBreakdown,
				columns: createErrorColumns(),
				getFilter: (row) => ({ field: "error_name", value: row.name }),
			});
		}

		return tabs;
	}, [
		providerBreakdown,
		modelBreakdown,
		finishReasonBreakdown,
		errorBreakdown,
	]);

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<SimpleMetricsChart
					data={callsSeries}
					description="Call volume over time"
					height={220}
					isLoading={isLoading}
					metrics={[
						{
							key: "calls",
							label: "Calls",
							color: "#3b82f6",
							formatValue: (value) => formatTokenCount(value),
						},
					]}
					title="Calls"
				/>
				<SimpleMetricsChart
					data={costSeries}
					description="Total spend over time"
					height={220}
					isLoading={isLoading}
					metrics={[
						{
							key: "cost",
							label: "Cost",
							color: "#f59e0b",
							formatValue: (value) => formatUsd(value),
						},
					]}
					title="Cost"
				/>
			</div>

			<SimpleMetricsChart
				data={latencySeries}
				description="Latency trend"
				height={240}
				isLoading={isLoading}
				metrics={[
					{
						key: "avg",
						label: "Average",
						color: "#10b981",
						formatValue: (value) => formatDurationMs(value),
					},
					{
						key: "p75",
						label: "p75",
						color: "#8b5cf6",
						formatValue: (value) => formatDurationMs(value),
					},
				]}
				title="Latency"
			/>

			{breakdownTabs.length > 0 && (
				<DataTable
					description="Provider, model, finish reason, and error breakdowns"
					isLoading={isLoading}
					onAddFilter={(field, value) =>
						addFilter({ field, operator: "eq", value })
					}
					tabs={breakdownTabs}
					title="Breakdowns"
				/>
			)}
		</div>
	);
}
