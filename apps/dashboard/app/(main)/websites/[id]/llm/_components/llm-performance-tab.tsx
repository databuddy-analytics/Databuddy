"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { formatDurationMs } from "../_lib/llm-analytics-utils";
import {
	createLatencyColumns,
	createSlowCallColumns,
	type LlmLatencyBreakdownRow,
	type LlmSlowCallRow,
} from "./llm-columns";

interface LlmPerformanceTabProps {
	dateRange: DateRange;
	websiteId: string;
}

interface LlmLatencySeriesRow {
	avg_duration_ms: number;
	date: string;
	p75_duration_ms: number;
	p95_duration_ms: number;
}

export function LlmPerformanceTab({
	websiteId,
	dateRange,
}: LlmPerformanceTabProps) {
	const queries: DynamicQueryRequest[] = [
		{ id: "llm-latency-series", parameters: ["llm_latency_time_series"] },
		{ id: "llm-latency-model", parameters: ["llm_latency_by_model"] },
		{ id: "llm-latency-provider", parameters: ["llm_latency_by_provider"] },
		{ id: "llm-slowest", parameters: ["llm_slowest_calls"] },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const latencySeries =
		(getDataForQuery(
			"llm-latency-series",
			"llm_latency_time_series"
		) as LlmLatencySeriesRow[]) ?? [];

	const latencyByModel =
		(getDataForQuery(
			"llm-latency-model",
			"llm_latency_by_model"
		) as LlmLatencyBreakdownRow[]) ?? [];
	const latencyByProvider =
		(getDataForQuery(
			"llm-latency-provider",
			"llm_latency_by_provider"
		) as LlmLatencyBreakdownRow[]) ?? [];
	const slowCalls =
		(
			getDataForQuery("llm-slowest", "llm_slowest_calls") as LlmSlowCallRow[]
		)?.map((row) => ({
			...row,
			name: row.trace_id ?? row.model,
		})) ?? [];

	const latencyChartData = useMemo(
		() =>
			latencySeries.map((row) => ({
				date: row.date,
				avg: row.avg_duration_ms ?? 0,
				p75: row.p75_duration_ms ?? 0,
				p95: row.p95_duration_ms ?? 0,
			})),
		[latencySeries]
	);

	const breakdownTabs = useMemo(() => {
		const tabs: TabConfig<LlmLatencyBreakdownRow>[] = [];

		if (latencyByModel.length > 0) {
			tabs.push({
				id: "models",
				label: "Models",
				data: latencyByModel,
				columns: createLatencyColumns(),
			});
		}

		if (latencyByProvider.length > 0) {
			tabs.push({
				id: "providers",
				label: "Providers",
				data: latencyByProvider,
				columns: createLatencyColumns(),
			});
		}

		return tabs;
	}, [latencyByModel, latencyByProvider]);

	return (
		<div className="space-y-4">
			<SimpleMetricsChart
				data={latencyChartData}
				description="Latency percentiles over time"
				height={260}
				isLoading={isLoading}
				metrics={[
					{
						key: "avg",
						label: "Average",
						color: "#22c55e",
						formatValue: (value) => formatDurationMs(value),
					},
					{
						key: "p75",
						label: "p75",
						color: "#3b82f6",
						formatValue: (value) => formatDurationMs(value),
					},
					{
						key: "p95",
						label: "p95",
						color: "#f97316",
						formatValue: (value) => formatDurationMs(value),
					},
				]}
				title="Latency Trends"
			/>

			{breakdownTabs.length > 0 && (
				<DataTable
					description="Latency breakdowns by model and provider"
					isLoading={isLoading}
					tabs={breakdownTabs}
					title="Latency Breakdown"
				/>
			)}

			<DataTable
				columns={createSlowCallColumns()}
				data={slowCalls}
				description="Slowest calls in the selected time range"
				isLoading={isLoading}
				title="Slow Calls"
			/>
		</div>
	);
}
