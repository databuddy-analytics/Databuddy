"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
	ChartTooltip,
	createTooltipEntries,
	formatTooltipDate,
} from "@/components/ui/chart-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type DataPoint = {
	date: string;
	[key: string]: string | number | null | undefined;
};

type MetricConfig = {
	key: string;
	label: string;
	color: string;
	formatValue?: (value: number) => string;
};

type SimpleMetricsChartProps = {
	data: DataPoint[];
	metrics: MetricConfig[];
	title?: string;
	description?: string;
	height?: number;
	isLoading?: boolean;
	className?: string;
};

const DEFAULT_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export function SimpleMetricsChart({
	data,
	metrics,
	title,
	description,
	height = 140,
	isLoading = false,
	className,
}: SimpleMetricsChartProps) {
	const metricsWithColors = useMemo(
		() =>
			metrics.map((m, i) => ({
				...m,
				color: m.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
			})),
		[metrics]
	);

	if (isLoading) {
		return (
			<Card
				className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
			>
				<div className="dotted-bg bg-accent pt-2">
					<Skeleton className="h-36 w-full" />
				</div>
				<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
					<div className="min-w-0 flex-1 space-y-1">
						<Skeleton className="h-4 w-24" />
						<Skeleton className="h-3 w-32" />
					</div>
					<div className="flex gap-1.5">
						<Skeleton className="h-5 w-12 rounded-full" />
						<Skeleton className="h-5 w-12 rounded-full" />
					</div>
				</div>
			</Card>
		);
	}

	const hasData = data.length > 0;
	const hasVariation =
		hasData &&
		metrics.some((m) => {
			const values = data
				.map((d) => d[m.key])
				.filter((v) => v != null) as number[];
			return values.length > 1 && values.some((v) => v !== values[0]);
		});

	return (
		<Card
			className={cn(
				"group gap-0 overflow-hidden border bg-card py-0 hover:border-primary",
				className
			)}
		>
			{/* Chart Area - matches stat-card */}
			<div className="dotted-bg bg-accent">
				{hasData ? (
					hasVariation ? (
						<ResponsiveContainer height={height} width="100%">
							<AreaChart
								data={data}
								margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
							>
								<defs>
									{metricsWithColors.map((metric) => (
										<linearGradient
											id={`gradient-${metric.key}`}
											key={metric.key}
											x1="0"
											x2="0"
											y1="0"
											y2="1"
										>
											<stop
												offset="0%"
												stopColor={metric.color}
												stopOpacity={0.4}
											/>
											<stop
												offset="100%"
												stopColor={metric.color}
												stopOpacity={0}
											/>
										</linearGradient>
									))}
								</defs>

								<XAxis dataKey="date" hide />
								<YAxis domain={["dataMin", "dataMax"]} hide />

								<Tooltip
									content={({ active, payload, label }) => (
										<ChartTooltip
											active={active}
											entries={createTooltipEntries(
												payload as Array<{
													dataKey: string;
													value: number;
													color: string;
												}>,
												metricsWithColors
											)}
											formatLabelAction={formatTooltipDate}
											label={label}
										/>
									)}
									cursor={{
										stroke: "var(--color-primary)",
										strokeOpacity: 0.3,
									}}
								/>

								{metricsWithColors.map((metric) => (
									<Area
										activeDot={{
											r: 2.5,
											fill: metric.color,
											stroke: "var(--color-background)",
											strokeWidth: 1.5,
										}}
										dataKey={metric.key}
										dot={false}
										fill={`url(#gradient-${metric.key})`}
										key={metric.key}
										name={metric.label}
										stroke={metric.color}
										strokeWidth={1.5}
										type="monotone"
									/>
								))}
							</AreaChart>
						</ResponsiveContainer>
					) : (
						<div className="flex items-center px-4" style={{ height }}>
							<div className="h-px w-full bg-primary/30" />
						</div>
					)
				) : (
					<div
						className="flex flex-col items-center justify-center"
						style={{ height }}
					>
						<ChartLineIcon className="size-8 text-muted-foreground/30" />
						<span className="mt-2 text-[10px] text-muted-foreground/60">
							No data
						</span>
					</div>
				)}
			</div>

			{/* Footer - matches stat-card exactly */}
			<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
				<div className="min-w-0 flex-1">
					{title && (
						<p className="truncate font-semibold text-sm leading-tight">
							{title}
						</p>
					)}
					{description && (
						<p className="truncate text-muted-foreground text-xs">
							{description}
						</p>
					)}
				</div>
				{/* Legend pills */}
				<div className="flex shrink-0 flex-wrap justify-end gap-1">
					{metricsWithColors.map((metric) => (
						<div
							className="flex items-center gap-1 rounded-full border bg-background px-1.5 py-0.5"
							key={metric.key}
						>
							<div
								className="size-1.5 rounded-full"
								style={{ backgroundColor: metric.color }}
							/>
							<span className="text-[10px] text-muted-foreground">
								{metric.label}
							</span>
						</div>
					))}
				</div>
			</div>
		</Card>
	);
}
