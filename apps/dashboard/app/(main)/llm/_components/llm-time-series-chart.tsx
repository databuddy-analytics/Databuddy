"use client";

import { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
import { useCallback, useState } from "react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { SkeletonChart } from "@/components/charts/skeleton-chart";
import { cn } from "@/lib/utils";
import {
	formatCurrency,
	formatDuration,
	formatNumber,
	type LLMTimeSeriesData,
} from "./llm-types";

interface MetricConfig {
	key: string;
	label: string;
	color: string;
	gradient: string;
	formatValue: (value: number) => string;
}

const METRICS: MetricConfig[] = [
	{
		key: "total_cost",
		label: "Cost",
		color: "var(--chart-1)",
		gradient: "llm-cost",
		formatValue: formatCurrency,
	},
	{
		key: "total_calls",
		label: "Requests",
		color: "#3b82f6",
		gradient: "llm-calls",
		formatValue: formatNumber,
	},
	{
		key: "total_tokens",
		label: "Tokens",
		color: "#10b981",
		gradient: "llm-tokens",
		formatValue: formatNumber,
	},
	{
		key: "avg_duration_ms",
		label: "Latency",
		color: "#f59e0b",
		gradient: "llm-latency",
		formatValue: formatDuration,
	},
];

interface TooltipPayloadEntry {
	dataKey: string;
	value: number;
	color: string;
	payload: Record<string, unknown>;
}

interface TooltipProps {
	active?: boolean;
	payload?: TooltipPayloadEntry[];
	label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
	if (!(active && payload?.length)) {
		return null;
	}

	return (
		<div className="min-w-[200px] rounded border bg-popover p-3 shadow-lg">
			<div className="mb-2 flex items-center gap-2 border-b pb-2">
				<div className="size-1.5 animate-pulse rounded-full bg-chart-1" />
				<p className="font-medium text-foreground text-xs">{label}</p>
			</div>
			<div className="space-y-1.5">
				{payload.map((entry) => {
					const metric = METRICS.find((m) => m.key === entry.dataKey);
					if (!metric || entry.value === undefined || entry.value === null) {
						return null;
					}

					return (
						<div
							className="flex items-center justify-between gap-3"
							key={entry.dataKey}
						>
							<div className="flex items-center gap-2">
								<div
									className="size-2.5 rounded-full"
									style={{ backgroundColor: entry.color }}
								/>
								<span className="text-muted-foreground text-xs">
									{metric.label}
								</span>
							</div>
							<span className="font-semibold text-foreground text-sm tabular-nums">
								{metric.formatValue(entry.value)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface LLMTimeSeriesChartProps {
	data: LLMTimeSeriesData[];
	isLoading: boolean;
	height?: number;
}

export function LLMTimeSeriesChart({
	data,
	isLoading,
	height = 350,
}: LLMTimeSeriesChartProps) {
	const [hiddenMetrics, setHiddenMetrics] = useState<Record<string, boolean>>(
		{}
	);
	const [hasAnimated, setHasAnimated] = useState(false);

	const toggleMetric = useCallback((key: string) => {
		setHiddenMetrics((prev) => ({
			...prev,
			[key]: !prev[key],
		}));
	}, []);

	if (isLoading) {
		return (
			<div className="rounded border bg-sidebar">
				<div className="flex flex-col items-start justify-between gap-3 border-b px-3 py-2.5 sm:flex-row sm:px-4 sm:py-3">
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-base text-sidebar-foreground sm:text-lg">
							Usage Over Time
						</h2>
						<p className="text-sidebar-foreground/70 text-xs sm:text-sm">
							Daily cost, requests, and performance trends
						</p>
					</div>
				</div>
				<div className="overflow-x-auto">
					<SkeletonChart className="rounded border-0" height={height} />
				</div>
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="rounded border bg-sidebar">
				<div className="flex flex-col items-start justify-between gap-3 border-b px-3 py-2.5 sm:flex-row sm:px-4 sm:py-3">
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-base text-sidebar-foreground sm:text-lg">
							Usage Over Time
						</h2>
						<p className="text-sidebar-foreground/70 text-xs sm:text-sm">
							Daily cost, requests, and performance trends
						</p>
					</div>
				</div>
				<div className="flex items-center justify-center p-8">
					<div className="flex flex-col items-center py-12 text-center">
						<div className="relative flex size-12 items-center justify-center rounded bg-accent">
							<ChartLineIcon
								className="size-6 text-foreground"
								weight="duotone"
							/>
						</div>
						<p className="mt-6 font-medium text-foreground text-lg">
							No data available
						</p>
						<p className="mx-auto max-w-sm text-muted-foreground text-sm">
							Your LLM analytics data will appear here as AI calls are made
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded border bg-sidebar">
			<div className="flex flex-col items-start justify-between gap-3 border-b px-3 py-2.5 sm:flex-row sm:px-4 sm:py-3">
				<div className="min-w-0 flex-1">
					<h2 className="font-semibold text-base text-sidebar-foreground sm:text-lg">
						Usage Over Time
					</h2>
					<p className="text-sidebar-foreground/70 text-xs sm:text-sm">
						Daily cost, requests, and performance trends
					</p>
				</div>
			</div>
			<div className="overflow-x-auto">
				<div
					className="w-full overflow-hidden rounded border-0 bg-card"
					style={{ minWidth: data.length > 14 ? 800 : undefined }}
				>
					<div className="p-0">
						<div
							className="relative select-none"
							style={{ width: "100%", height: height + 20 }}
						>
							<ResponsiveContainer height="100%" width="100%">
								<ComposedChart
									data={data}
									margin={{
										top: 30,
										right: 30,
										left: 20,
										bottom: data.length > 5 ? 60 : 20,
									}}
								>
									<defs>
										{METRICS.map((metric) => (
											<linearGradient
												id={`gradient-${metric.gradient}`}
												key={metric.key}
												x1="0"
												x2="0"
												y1="0"
												y2="1"
											>
												<stop
													offset="0%"
													stopColor={metric.color}
													stopOpacity={0.3}
												/>
												<stop
													offset="100%"
													stopColor={metric.color}
													stopOpacity={0.02}
												/>
											</linearGradient>
										))}
									</defs>

									<CartesianGrid
										stroke="var(--sidebar-border)"
										strokeDasharray="2 4"
										strokeOpacity={0.3}
										vertical={false}
									/>

									<XAxis
										axisLine={false}
										dataKey="date"
										tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
										tickLine={false}
									/>

									<YAxis
										axisLine={false}
										tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
										tickLine={false}
										width={45}
									/>

									<Tooltip
										content={<CustomTooltip />}
										cursor={{
											stroke: "var(--color-chart-1)",
											strokeDasharray: "4 4",
											strokeOpacity: 0.5,
										}}
									/>

									<Legend
										align="center"
										formatter={(label) => {
											const metric = METRICS.find((m) => m.label === label);
											const isHidden = metric
												? hiddenMetrics[metric.key]
												: false;
											return (
												<span
													className={cn(
														"cursor-pointer text-xs",
														isHidden
															? "text-muted-foreground line-through opacity-50"
															: "text-muted-foreground hover:text-foreground"
													)}
												>
													{label}
												</span>
											);
										}}
										onClick={(payload: { value: string }) => {
											const metric = METRICS.find(
												(m) => m.label === payload.value
											);
											if (metric) {
												toggleMetric(metric.key);
											}
										}}
										verticalAlign="bottom"
										wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }}
									/>

									{METRICS.map((metric) => (
										<Area
											activeDot={{
												r: 4,
												stroke: metric.color,
												strokeWidth: 2,
											}}
											dataKey={metric.key}
											fill={`url(#gradient-${metric.gradient})`}
											hide={hiddenMetrics[metric.key]}
											isAnimationActive={!hasAnimated}
											key={metric.key}
											name={metric.label}
											onAnimationEnd={() => {
												setHasAnimated(true);
											}}
											stroke={metric.color}
											strokeWidth={2.5}
											type="monotone"
										/>
									))}
								</ComposedChart>
							</ResponsiveContainer>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
