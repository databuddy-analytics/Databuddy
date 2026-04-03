"use client";

import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import { ClockIcon } from "@phosphor-icons/react/dist/ssr/Clock";
import { CpuIcon } from "@phosphor-icons/react/dist/ssr/Cpu";
import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/ssr/CurrencyDollar";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr/Lightning";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { WrenchIcon } from "@phosphor-icons/react/dist/ssr/Wrench";
import { StatCard } from "@/components/analytics/stat-card";
import {
	formatCurrency,
	formatDuration,
	formatNumber,
	formatPercentage,
	type LLMKpiData,
} from "./llm-types";

interface LLMKpisProps {
	chartData: {
		cost: Array<{ date: string; value: number }>;
		calls: Array<{ date: string; value: number }>;
		tokens: Array<{ date: string; value: number }>;
		latency: Array<{ date: string; value: number }>;
	};
	isLoading: boolean;
	kpis: LLMKpiData | null;
}

export function LLMPrimaryKpis({ kpis, isLoading, chartData }: LLMKpisProps) {
	return (
		<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
			<StatCard
				chartData={chartData.cost}
				chartType="area"
				description="Last 30 days"
				formatChartValue={formatCurrency}
				icon={CurrencyDollarIcon}
				id="llm-total-cost"
				isLoading={isLoading}
				showChart={true}
				title="Total Cost"
				value={formatCurrency(kpis?.total_cost)}
			/>
			<StatCard
				chartData={chartData.calls}
				chartType="area"
				description="Last 30 days"
				formatChartValue={formatNumber}
				icon={LightningIcon}
				id="llm-total-calls"
				isLoading={isLoading}
				showChart={true}
				title="Total Requests"
				value={formatNumber(kpis?.total_calls)}
			/>
			<StatCard
				chartData={chartData.tokens}
				chartType="area"
				description="Last 30 days"
				formatChartValue={formatNumber}
				icon={CpuIcon}
				id="llm-total-tokens"
				isLoading={isLoading}
				showChart={true}
				title="Total Tokens"
				value={formatNumber(kpis?.total_tokens)}
			/>
			<StatCard
				chartData={chartData.latency}
				chartType="line"
				description="p75"
				formatChartValue={formatDuration}
				icon={ClockIcon}
				id="llm-avg-latency"
				isLoading={isLoading}
				showChart={true}
				title="Avg Latency"
				value={formatDuration(kpis?.avg_duration_ms)}
			/>
		</div>
	);
}

export function LLMSecondaryKpis({
	kpis,
	isLoading,
}: Omit<LLMKpisProps, "chartData">) {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
			<StatCard
				displayMode="compact"
				icon={WarningCircleIcon}
				id="llm-error-rate"
				invertTrend={true}
				isLoading={isLoading}
				title="Error Rate"
				value={formatPercentage(kpis?.error_rate)}
			/>
			<StatCard
				displayMode="compact"
				icon={ChartLineUpIcon}
				id="llm-cache-hit-rate"
				isLoading={isLoading}
				title="Cache Hit Rate"
				value={formatPercentage(kpis?.cache_hit_rate)}
			/>
			<StatCard
				displayMode="compact"
				icon={CpuIcon}
				id="llm-input-tokens"
				isLoading={isLoading}
				title="Input Tokens"
				value={formatNumber(kpis?.total_input_tokens)}
			/>
			<StatCard
				displayMode="compact"
				icon={CpuIcon}
				id="llm-output-tokens"
				isLoading={isLoading}
				title="Output Tokens"
				value={formatNumber(kpis?.total_output_tokens)}
			/>
			<StatCard
				displayMode="compact"
				icon={WrenchIcon}
				id="llm-tool-use-rate"
				isLoading={isLoading}
				title="Tool Use Rate"
				value={formatPercentage(kpis?.tool_use_rate)}
			/>
			<StatCard
				displayMode="compact"
				icon={ClockIcon}
				id="llm-p75-latency"
				isLoading={isLoading}
				title="p75 Latency"
				value={formatDuration(kpis?.p75_duration_ms)}
			/>
		</div>
	);
}
