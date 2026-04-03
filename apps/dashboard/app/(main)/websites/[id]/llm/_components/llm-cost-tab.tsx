"use client";

import type { DateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { SimpleMetricsChart } from "@/components/charts/simple-metrics-chart";
import { DataTable, type TabConfig } from "@/components/table/data-table";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import { addDynamicFilterAtom } from "@/stores/jotai/filterAtoms";
import { formatUsd, pivotTimeSeries } from "../_lib/llm-analytics-utils";
import {
	createModelColumns,
	createProviderColumns,
	type LlmModelBreakdownRow,
	type LlmProviderBreakdownRow,
} from "./llm-columns";

interface LlmCostTabProps {
	dateRange: DateRange;
	websiteId: string;
}

interface LlmCostSeriesRow {
	date: string;
	model?: string;
	provider?: string;
	total_cost: number;
}

export function LlmCostTab({ websiteId, dateRange }: LlmCostTabProps) {
	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const queries: DynamicQueryRequest[] = [
		{
			id: "llm-cost-provider",
			parameters: ["llm_cost_by_provider_time_series"],
		},
		{ id: "llm-cost-model", parameters: ["llm_cost_by_model_time_series"] },
		{ id: "llm-provider", parameters: ["llm_provider_breakdown"] },
		{ id: "llm-model", parameters: ["llm_model_breakdown"] },
	];

	const { isLoading, getDataForQuery } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const providerSeries =
		(getDataForQuery(
			"llm-cost-provider",
			"llm_cost_by_provider_time_series"
		) as LlmCostSeriesRow[]) ?? [];
	const modelSeries =
		(getDataForQuery(
			"llm-cost-model",
			"llm_cost_by_model_time_series"
		) as LlmCostSeriesRow[]) ?? [];

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

	const providerPivot = useMemo(
		() =>
			pivotTimeSeries(
				providerSeries.map((row) => ({
					date: row.date,
					seriesKey: row.provider ?? "unknown",
					value: row.total_cost ?? 0,
				}))
			),
		[providerSeries]
	);

	const modelPivot = useMemo(
		() =>
			pivotTimeSeries(
				modelSeries.map((row) => ({
					date: row.date,
					seriesKey: row.model ?? "unknown",
					value: row.total_cost ?? 0,
				}))
			),
		[modelSeries]
	);

	const breakdownTabs = useMemo(() => {
		const tabs: TabConfig<LlmProviderBreakdownRow | LlmModelBreakdownRow>[] =
			[];

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

		return tabs;
	}, [providerBreakdown, modelBreakdown]);

	const providerMetrics = providerPivot.seriesKeys.map((key, index) => ({
		key,
		label: key,
		color: ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"][index % 5],
		formatValue: (value: number) => formatUsd(value),
	}));

	const modelMetrics = modelPivot.seriesKeys.map((key, index) => ({
		key,
		label: key,
		color: ["#22c55e", "#f97316", "#6366f1", "#ec4899", "#14b8a6"][index % 5],
		formatValue: (value: number) => formatUsd(value),
	}));

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<SimpleMetricsChart
					data={providerPivot.data}
					description="Spend over time by provider"
					height={240}
					isLoading={isLoading}
					metrics={providerMetrics}
					title="Cost by Provider"
				/>
				<SimpleMetricsChart
					data={modelPivot.data}
					description="Spend over time by model"
					height={240}
					isLoading={isLoading}
					metrics={modelMetrics}
					title="Cost by Model"
				/>
			</div>

			{breakdownTabs.length > 0 && (
				<DataTable
					description="Cost and token breakdowns"
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
