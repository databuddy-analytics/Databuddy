"use client";

import type { DynamicQueryRequest } from "@databuddy/shared/types/api";
import {
	ChartLineIcon,
	CurrencyDollarIcon,
	LightningIcon,
	RobotIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/empty-state";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useBatchDynamicQuery } from "@/hooks/use-dynamic-query";
import {
	formatDurationMs,
	formatPercent,
	formatTokenCount,
	formatUsd,
} from "../_lib/llm-analytics-utils";
import { LlmLoadingSkeleton } from "./llm-loading-skeleton";
import { LlmOverviewTab } from "./llm-overview-tab";

interface LlmOverviewKpiRow {
	avg_duration_ms: number;
	cache_hit_rate: number;
	error_count: number;
	error_rate: number;
	p75_duration_ms: number;
	tool_use_rate: number;
	total_calls: number;
	total_cost: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	web_search_rate: number;
}

interface LlmTimeSeriesRow {
	avg_duration_ms: number;
	date: string;
	error_count: number;
	error_rate: number;
	p75_duration_ms: number;
	total_calls: number;
	total_cost: number;
	total_tokens: number;
}

export function LlmAnalyticsContent() {
	const params = useParams();
	const websiteId = params.id as string;

	const { chartType, chartStepType } = useChartPreferences("llm");
	const { dateRange } = useDateFilters();

	const queries: DynamicQueryRequest[] = [
		{ id: "llm-kpis", parameters: ["llm_overview_kpis"] },
		{ id: "llm-series", parameters: ["llm_time_series"] },
	];

	const { isLoading, getDataForQuery, error } = useBatchDynamicQuery(
		websiteId,
		dateRange,
		queries
	);

	const kpiRow = (
		getDataForQuery("llm-kpis", "llm_overview_kpis") as LlmOverviewKpiRow[]
	)[0] ?? {
		total_calls: 0,
		total_cost: 0,
		total_tokens: 0,
		total_input_tokens: 0,
		total_output_tokens: 0,
		avg_duration_ms: 0,
		p75_duration_ms: 0,
		error_count: 0,
		error_rate: 0,
		cache_hit_rate: 0,
		tool_use_rate: 0,
		web_search_rate: 0,
	};

	const timeSeries =
		(getDataForQuery("llm-series", "llm_time_series") as LlmTimeSeriesRow[]) ??
		[];

	const miniChartData = useMemo(
		() => ({
			calls: timeSeries.map((row) => ({
				date: row.date,
				value: row.total_calls ?? 0,
			})),
			cost: timeSeries.map((row) => ({
				date: row.date,
				value: row.total_cost ?? 0,
			})),
			tokens: timeSeries.map((row) => ({
				date: row.date,
				value: row.total_tokens ?? 0,
			})),
			latency: timeSeries.map((row) => ({
				date: row.date,
				value: row.avg_duration_ms ?? 0,
			})),
			errorRate: timeSeries.map((row) => ({
				date: row.date,
				value: (row.error_rate ?? 0) * 100,
			})),
		}),
		[timeSeries]
	);

	if (error) {
		return (
			<div className="p-3 sm:p-4">
				<div className="rounded border border-destructive/20 bg-destructive/5 p-6">
					<div className="flex flex-col items-center text-center">
						<div className="mb-4 flex size-12 items-center justify-center rounded bg-destructive/10">
							<RobotIcon className="size-6 text-destructive" weight="duotone" />
						</div>
						<h4 className="mb-2 font-semibold text-destructive">
							Error loading data
						</h4>
						<p className="max-w-md text-balance text-destructive/80 text-sm">
							There was an issue loading your LLM analytics. Please try
							refreshing using the toolbar above.
						</p>
					</div>
				</div>
			</div>
		);
	}

	const hasData = kpiRow.total_calls > 0;

	return (
		<div className="space-y-3 p-3 sm:space-y-4 sm:p-4">
			{isLoading ? (
				<LlmLoadingSkeleton />
			) : hasData ? (
				<>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
						<StatCard
							chartData={miniChartData.calls}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={RobotIcon}
							id="llm-total-calls"
							isLoading={isLoading}
							showChart
							title="Total Calls"
							value={formatTokenCount(kpiRow.total_calls)}
						/>
						<StatCard
							chartData={miniChartData.cost}
							chartStepType={chartStepType}
							chartType={chartType}
							formatChartValue={(v) => formatUsd(v)}
							icon={CurrencyDollarIcon}
							id="llm-total-cost"
							isLoading={isLoading}
							showChart
							title="Total Cost"
							value={formatUsd(kpiRow.total_cost)}
						/>
						<StatCard
							chartData={miniChartData.tokens}
							chartStepType={chartStepType}
							chartType={chartType}
							icon={LightningIcon}
							id="llm-total-tokens"
							isLoading={isLoading}
							showChart
							title="Total Tokens"
							value={formatTokenCount(kpiRow.total_tokens)}
						/>
						<StatCard
							chartData={miniChartData.latency}
							chartStepType={chartStepType}
							chartType={chartType}
							formatChartValue={(v) => formatDurationMs(v)}
							icon={ChartLineIcon}
							id="llm-avg-latency"
							isLoading={isLoading}
							showChart
							title="Avg Latency"
							value={formatDurationMs(kpiRow.avg_duration_ms)}
						/>
						<StatCard
							chartData={miniChartData.errorRate}
							chartStepType={chartStepType}
							chartType={chartType}
							formatChartValue={(v) => {
								const safeValue = v == null || Number.isNaN(v) ? 0 : v;
								return `${safeValue.toFixed(1)}%`;
							}}
							icon={WarningIcon}
							id="llm-error-rate"
							invertTrend
							isLoading={isLoading}
							showChart
							title="Error Rate"
							value={formatPercent(kpiRow.error_rate)}
						/>
					</div>

					<LlmOverviewTab dateRange={dateRange} websiteId={websiteId} />
				</>
			) : (
				<div className="flex flex-1 items-center justify-center py-16">
					<EmptyState
						description={
							<>
								LLM analytics will appear here once you start tracking AI calls.
								Use the{" "}
								<code className="rounded bg-muted px-1 py-0.5 text-xs">
									databuddy.llm()
								</code>{" "}
								SDK method to track LLM requests.
							</>
						}
						icon={<RobotIcon />}
						title="No LLM data yet"
						variant="minimal"
					/>
				</div>
			)}
		</div>
	);
}
