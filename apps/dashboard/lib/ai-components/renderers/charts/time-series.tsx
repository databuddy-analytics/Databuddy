"use client";

import { useCallback, useMemo, useState } from "react";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { Chart } from "@/components/ui/composables/chart";
import { Skeleton } from "@/components/ui/skeleton";
import {
	chartAxisTickDefault,
	chartAxisYWidthCompact,
	chartCartesianGridDefault,
	chartLegendPillClassName,
	chartLegendPillDotClassName,
	chartLegendPillLabelClassName,
	chartLegendPillRowClassName,
	chartSeriesColorAtIndex,
	chartSurfaceClassName,
	chartTooltipSingleShellClassName,
} from "@/lib/chart-presentation";
import dayjs from "@/lib/dayjs";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ChartComponentProps } from "../../types";

const {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} = Chart.Recharts;

export interface TimeSeriesProps extends ChartComponentProps {
	data: Record<string, string | number>[];
	series: string[];
	variant: "line" | "bar" | "area" | "stacked-bar";
}

const PLOT_HEIGHT = 200;

const formatDateTick = (value: string) => {
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("MMM D") : value;
};

const formatDateLabel = (value: string) => {
	const parsed = dayjs(value);
	return parsed.isValid() ? parsed.format("MMM D, YYYY") : value;
};

export function TimeSeriesRenderer({
	variant,
	title,
	data,
	series,
	className,
	streaming,
}: TimeSeriesProps) {
	const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

	const visibleSeries = useMemo(
		() => series.filter((s) => !hiddenSeries.has(s)),
		[series, hiddenSeries]
	);

	const toggleSeries = useCallback((key: string) => {
		setHiddenSeries((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	const isSkeleton = data.length === 0;

	const tooltipContent = useCallback(
		({
			active,
			payload,
			label,
		}: {
			active?: boolean;
			payload?: Array<{
				value?: number;
				dataKey?: string | number;
				color?: string;
			}>;
			label?: string;
		}) => {
			if (!(active && payload?.length)) {
				return null;
			}
			return (
				<div className={chartTooltipSingleShellClassName}>
					<p className="mb-1 text-[10px] text-muted-foreground">
						{formatDateLabel(String(label ?? ""))}
					</p>
					{payload.map((entry) => (
						<p
							className="font-semibold text-foreground text-sm tabular-nums"
							key={entry.dataKey}
						>
							{formatNumber(entry.value ?? 0)}{" "}
							<span className="font-normal text-muted-foreground">
								{entry.dataKey}
							</span>
						</p>
					))}
				</div>
			);
		},
		[]
	);

	const chartProps = {
		data,
		margin: { top: 4, right: 4, left: 0, bottom: 0 },
	};

	const renderChart = () => {
		const axisProps = {
			axisLine: false,
			tickLine: false,
			tick: chartAxisTickDefault,
		};

		const xAxisProps = {
			...axisProps,
			dataKey: "x" as const,
			tickFormatter: formatDateTick,
		};

		const yAxisProps = {
			...axisProps,
			width: chartAxisYWidthCompact,
			tickFormatter: (v: number) => formatNumber(v),
		};

		if (variant === "bar" || variant === "stacked-bar") {
			return (
				<BarChart {...chartProps}>
					<CartesianGrid {...chartCartesianGridDefault} />
					<XAxis {...xAxisProps} />
					<YAxis {...yAxisProps} />
					<Tooltip
						content={tooltipContent}
						cursor={{ fill: "var(--accent)", fillOpacity: 0.5 }}
					/>
					{visibleSeries.map((key, idx) => (
						<Bar
							dataKey={key}
							fill={chartSeriesColorAtIndex(series.indexOf(key))}
							key={key}
							radius={
								variant === "stacked-bar"
									? idx === visibleSeries.length - 1
										? [3, 3, 0, 0]
										: [0, 0, 0, 0]
									: [3, 3, 0, 0]
							}
							stackId={variant === "stacked-bar" ? "stack" : undefined}
						/>
					))}
				</BarChart>
			);
		}

		if (variant === "line") {
			return (
				<LineChart {...chartProps}>
					<CartesianGrid {...chartCartesianGridDefault} />
					<XAxis {...xAxisProps} />
					<YAxis {...yAxisProps} />
					<Tooltip
						content={tooltipContent}
						cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
					/>
					{visibleSeries.map((key) => (
						<Line
							activeDot={{ r: 3, strokeWidth: 0 }}
							dataKey={key}
							dot={false}
							key={key}
							stroke={chartSeriesColorAtIndex(series.indexOf(key))}
							strokeWidth={2}
							type="monotone"
						/>
					))}
				</LineChart>
			);
		}

		// area (default)
		return (
			<AreaChart {...chartProps}>
				<CartesianGrid {...chartCartesianGridDefault} />
				<XAxis {...xAxisProps} />
				<YAxis {...yAxisProps} />
				<Tooltip
					content={tooltipContent}
					cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
				/>
				{visibleSeries.map((key) => {
					const color = chartSeriesColorAtIndex(series.indexOf(key));
					return (
						<Area
							activeDot={{ r: 3, strokeWidth: 0 }}
							dataKey={key}
							dot={false}
							fill={color}
							fillOpacity={0.1}
							key={key}
							stroke={color}
							strokeWidth={2}
							type="monotone"
						/>
					);
				})}
			</AreaChart>
		);
	};

	return (
		<div className={cn(chartSurfaceClassName, className)}>
			<div className="dotted-bg bg-accent">
				{isSkeleton ? (
					<Skeleton className="h-[200px] w-full rounded-none" />
				) : (
					<ChartErrorBoundary fallbackClassName={`h-[${PLOT_HEIGHT}px] w-full`}>
						<ResponsiveContainer height={PLOT_HEIGHT} width="100%">
							{renderChart()}
						</ResponsiveContainer>
					</ChartErrorBoundary>
				)}
			</div>
			<div className="flex items-center gap-2.5 border-t px-3 py-2">
				{title && (
					<p className="min-w-0 flex-1 truncate font-medium text-sm">{title}</p>
				)}
				<div className={chartLegendPillRowClassName}>
					{series.map((key) => {
						const color = chartSeriesColorAtIndex(series.indexOf(key));
						const hidden = hiddenSeries.has(key);
						return (
							<button
								className={cn(chartLegendPillClassName, hidden && "opacity-40")}
								key={key}
								onClick={() => toggleSeries(key)}
								type="button"
							>
								<div
									className={chartLegendPillDotClassName}
									style={{
										backgroundColor: hidden ? "var(--muted-foreground)" : color,
									}}
								/>
								<span className={chartLegendPillLabelClassName}>{key}</span>
							</button>
						);
					})}
				</div>
			</div>
			{streaming && !isSkeleton && (
				<div className="h-0.5 w-full overflow-hidden">
					<div
						className="h-full w-1/3 animate-pulse rounded bg-primary/30"
						style={{ animation: "pulse 1.5s ease-in-out infinite" }}
					/>
				</div>
			)}
		</div>
	);
}
