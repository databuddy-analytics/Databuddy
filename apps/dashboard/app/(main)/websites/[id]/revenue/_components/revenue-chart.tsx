"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { SkeletonChart } from "@/components/charts/skeleton-chart";
import { Chart } from "@/components/ui/composables/chart";
import {
	chartAxisTickDefault,
	chartAxisYWidthDefault,
	chartCartesianGridDefault,
	chartRechartsInteractiveLegendLabelClassName,
	chartRechartsLegendIconSize,
	chartRechartsLegendInteractiveWrapperStyle,
	chartSeriesColorAtIndex,
	chartSurfaceClassName,
} from "@/lib/chart-presentation";
import { cn } from "@/lib/utils";
import type { RevenueMetricVisibilityState } from "@/stores/jotai/chartAtoms";
import {
	revenueMetricVisibilityAtom,
	toggleRevenueMetricAtom,
} from "@/stores/jotai/chartAtoms";

const {
	Area,
	CartesianGrid,
	ComposedChart,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} = Chart.Recharts;

interface RevenueChartDataPoint {
	avg_transaction: number;
	customers: number;
	date: string;
	refunds: number;
	revenue: number;
	transactions: number;
}

interface RevenueChartMetric {
	color: string;
	formatValue: (value: number) => string;
	key: keyof RevenueChartDataPoint;
	label: string;
}

const REVENUE_METRICS: RevenueChartMetric[] = [
	{
		key: "revenue",
		label: "Revenue",
		color: chartSeriesColorAtIndex(0),
		formatValue: (v) =>
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			}).format(v),
	},
	{
		key: "transactions",
		label: "Transactions",
		color: chartSeriesColorAtIndex(1),
		formatValue: (v) => v.toLocaleString(),
	},
	{
		key: "avg_transaction",
		label: "Avg Transaction",
		color: chartSeriesColorAtIndex(2),
		formatValue: (v) =>
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			}).format(v),
	},
	{
		key: "customers",
		label: "Customers",
		color: chartSeriesColorAtIndex(3),
		formatValue: (v) => v.toLocaleString(),
	},
	{
		key: "refunds",
		label: "Refunds",
		color: chartSeriesColorAtIndex(4),
		formatValue: (v) =>
			new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
				minimumFractionDigits: 0,
				maximumFractionDigits: 0,
			}).format(Math.abs(v)),
	},
];

interface RevenueChartProps {
	className?: string;
	data: RevenueChartDataPoint[];
	height?: number;
	isLoading: boolean;
}

export function RevenueChart({
	data,
	isLoading,
	height = 350,
	className,
}: RevenueChartProps) {
	const [visibleMetrics] = useAtom(revenueMetricVisibilityAtom);
	const [, toggleMetric] = useAtom(toggleRevenueMetricAtom);

	const hiddenMetrics = useMemo(
		() =>
			Object.fromEntries(
				REVENUE_METRICS.map((m) => [
					m.key,
					!visibleMetrics[m.key as keyof RevenueMetricVisibilityState],
				])
			),
		[visibleMetrics]
	);

	const hasData = data.length > 0;

	if (isLoading) {
		return (
			<div className={cn("w-full overflow-x-auto", className)}>
				<SkeletonChart className="w-full" height={height} />
			</div>
		);
	}

	if (!hasData) {
		return (
			<div className={cn(chartSurfaceClassName, className)}>
				<div className="flex items-center justify-center p-8">
					<div className="flex flex-col items-center py-12 text-center">
						<div className="relative flex size-12 items-center justify-center rounded bg-accent">
							<ChartLineIcon className="size-6 text-foreground" />
						</div>
						<p className="mt-6 font-medium text-foreground text-lg">
							No data available
						</p>
						<p className="mx-auto max-w-sm text-muted-foreground text-sm">
							Revenue data will appear here once transactions are processed
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={cn(chartSurfaceClassName, className)}>
			<div
				className="relative select-none"
				style={{
					width: "100%",
					height: height + 20,
				}}
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
							{REVENUE_METRICS.map((metric) => (
								<linearGradient
									id={`revenue-gradient-${metric.key}`}
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
						<CartesianGrid {...chartCartesianGridDefault} />
						<XAxis
							axisLine={false}
							dataKey="date"
							tick={chartAxisTickDefault}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							tick={chartAxisTickDefault}
							tickLine={false}
							width={chartAxisYWidthDefault}
						/>
						<Tooltip
							content={({ active, payload, label }) => (
								<Chart.Tooltip
									active={active}
									entries={Chart.createTooltipEntries(
										payload as Array<{
											dataKey: string;
											value: number;
											color: string;
										}>,
										REVENUE_METRICS
									)}
									formatLabelAction={Chart.formatTooltipDate}
									label={label}
								/>
							)}
							cursor={Chart.tooltipCursorLine}
						/>
						<Legend
							align="center"
							formatter={(label) => {
								const metric = REVENUE_METRICS.find((m) => m.label === label);
								const isHidden = metric ? hiddenMetrics[metric.key] : false;
								return (
									<span
										className={chartRechartsInteractiveLegendLabelClassName(
											isHidden
										)}
									>
										{label}
									</span>
								);
							}}
							iconSize={chartRechartsLegendIconSize}
							iconType="circle"
							onClick={(payload: { value?: string }) => {
								const metric = REVENUE_METRICS.find(
									(m) => m.label === payload.value
								);
								if (metric) {
									toggleMetric(
										metric.key as keyof RevenueMetricVisibilityState
									);
								}
							}}
							verticalAlign="bottom"
							wrapperStyle={chartRechartsLegendInteractiveWrapperStyle}
						/>
						{REVENUE_METRICS.map((metric) => (
							<Area
								activeDot={{
									r: 4,
									stroke: metric.color,
									strokeWidth: 2,
								}}
								dataKey={metric.key}
								dot={false}
								fill={`url(#revenue-gradient-${metric.key})`}
								hide={hiddenMetrics[metric.key]}
								key={metric.key}
								name={metric.label}
								stroke={metric.color}
								strokeWidth={2.5}
								type="monotone"
							/>
						))}
					</ComposedChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
