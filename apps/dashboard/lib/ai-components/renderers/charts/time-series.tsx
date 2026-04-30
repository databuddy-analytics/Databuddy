"use client";

import { useCallback, useMemo, useState } from "react";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { Chart } from "@/components/ui/composables/chart";
import {
	chartAxisTickDefault,
	chartAxisYWidthCompact,
	chartCartesianGridDefault,
	chartLegendPillClassName,
	chartLegendPillDotClassName,
	chartLegendPillLabelClassName,
	chartLegendPillRowClassName,
	chartSeriesColorAtIndex,
	chartTooltipSingleShellClassName,
} from "@/lib/chart-presentation";
import { dayjs } from "@databuddy/ui";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ChartComponentProps } from "../../types";
import { ChartLineIcon } from "@databuddy/ui/icons";
import { Badge, Card, Skeleton } from "@databuddy/ui";

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
const VARIANT_LABEL: Record<TimeSeriesProps["variant"], string> = {
	line: "Line",
	bar: "Bar",
	area: "Area",
	"stacked-bar": "Stacked",
};

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
		<Card className={cn("gap-0 overflow-hidden border-0 bg-secondary p-1", className)}>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded-md bg-background px-2.5 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<ChartLineIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="min-w-0 flex-1 truncate font-medium text-sm">
						{title ?? "Time Series"}
					</p>
					<div className={cn("ml-auto min-w-0 flex-1 flex-wrap", chartLegendPillRowClassName)}>
							{series.map((key) => {
								const color = chartSeriesColorAtIndex(series.indexOf(key));
								const hidden = hiddenSeries.has(key);
								return (
									<button
										className={cn("flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1", hidden && "opacity-40")}
										key={key}
										onClick={() => toggleSeries(key)}
										type="button"
									>
										<div
											className={chartLegendPillDotClassName}
											style={{
												backgroundColor: hidden
													? "var(--muted-foreground)"
													: color,
											}}
										/>
										<span className={chartLegendPillLabelClassName}>{key}</span>
									</button>
								);
							})}
						</div>
				</div>

				<div className="rounded-md bg-background px-3 py-3">
					<div className="dotted-bg overflow-hidden rounded bg-accent/90">
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
				</div>
			</div>
		</Card>
	);
}
