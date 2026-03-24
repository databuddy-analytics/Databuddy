"use client";

import { ChartPieIcon } from "@phosphor-icons/react";
import { memo, useCallback, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const CHART_COLORS = [
	"var(--color-chart-1)",
	"var(--color-chart-2)",
	"var(--color-chart-3)",
	"var(--color-chart-4)",
	"var(--color-chart-5)",
	"var(--color-chart-1)",
];

interface PieChartDataPoint {
	name: string;
	value: number;
	color?: string;
}

export type PieChartVariant = "pie" | "donut";

interface MiniPieChartProps {
	data: PieChartDataPoint[];
	id: string;
	variant?: PieChartVariant;
	showLabels?: boolean;
	title?: string;
	isLoading?: boolean;
	className?: string;
}

interface ActiveShapeProps {
	cx: number;
	cy: number;
	innerRadius: number;
	outerRadius: number;
	startAngle: number;
	endAngle: number;
	fill: string;
	name: string;
	value: number;
	percent: number;
}

const renderActiveShape = (props: ActiveShapeProps) => {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
		props;

	return (
		<g>
			<Sector
				cx={cx}
				cy={cy}
				endAngle={endAngle}
				fill={fill}
				innerRadius={innerRadius - 2}
				outerRadius={outerRadius + 6}
				startAngle={startAngle}
				style={{
					filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.15))",
					transition: "transform 150ms ease-out, opacity 150ms ease-out",
				}}
			/>
		</g>
	);
};

const MiniPieChart = memo(
	({
		data,
		id,
		variant = "donut",
		showLabels = true,
		title,
		isLoading = false,
		className,
	}: MiniPieChartProps) => {
		const [activeIndex, setActiveIndex] = useState<number>(-1);

		const onPieEnter = useCallback((_: unknown, index: number) => {
			setActiveIndex(index);
		}, []);

		const onPieLeave = useCallback(() => {
			setActiveIndex(-1);
		}, []);

		const total = data.reduce((sum, item) => sum + item.value, 0);
		const processedData = data.map((item, index) => ({
			...item,
			color: item.color ?? CHART_COLORS[index % CHART_COLORS.length],
			percent: total > 0 ? (item.value / total) * 100 : 0,
		}));

		const innerRadius = variant === "donut" ? 32 : 0;
		const outerRadius = 52;

		if (isLoading) {
			return (
				<Card
					className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
					id={id}
				>
					<div className="dotted-bg bg-accent pt-0">
						<Skeleton className="h-32 w-full" />
					</div>
					<div className="flex items-center gap-2.5 border-t px-2.5 py-2.5">
						<Skeleton className="size-7 shrink-0 rounded" />
						<div className="min-w-0 flex-1 space-y-0.5">
							<Skeleton className="h-5 w-14" />
							<Skeleton className="h-3 w-12" />
						</div>
					</div>
				</Card>
			);
		}

		if (data.length === 0) {
			return (
				<Card
					className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
					id={id}
				>
					<div className="dotted-bg flex h-32 items-center justify-center bg-accent">
						<span className="text-[10px] text-muted-foreground opacity-60">
							No data
						</span>
					</div>
					<div className="flex items-center gap-2.5 px-2.5 py-2.5">
						<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
							<ChartPieIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-muted-foreground text-sm">
								{title ?? "Distribution"}
							</p>
						</div>
					</div>
				</Card>
			);
		}

		return (
			<Card
				className={cn(
					"group gap-0 overflow-hidden border bg-card py-0 hover:border-primary",
					className
				)}
				id={id}
			>
				<div className="dotted-bg flex h-32 items-center justify-center bg-accent">
					<ChartErrorBoundary fallbackClassName="size-full">
						<ResponsiveContainer height={120} width={120}>
							<PieChart>
								<Pie
									activeIndex={activeIndex >= 0 ? activeIndex : undefined}
									activeShape={renderActiveShape as never}
									animationBegin={0}
									animationDuration={400}
									animationEasing="ease-out"
									cx="50%"
									cy="50%"
									data={processedData}
									dataKey="value"
									innerRadius={innerRadius}
									onMouseEnter={onPieEnter}
									onMouseLeave={onPieLeave}
									outerRadius={outerRadius}
									paddingAngle={0}
									strokeWidth={0}
								>
									{processedData.map((entry, index) => (
										<Cell
											fill={entry.color}
											key={`${id}-cell-${entry.name}`}
											style={{
												opacity:
													activeIndex === -1 || activeIndex === index ? 1 : 0.5,
												transition: "opacity 150ms ease-out",
											}}
										/>
									))}
								</Pie>
							</PieChart>
						</ResponsiveContainer>
					</ChartErrorBoundary>
				</div>
				<div className="flex items-center gap-2.5 px-2.5 py-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
						<ChartPieIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate font-semibold text-base tabular-nums leading-tight">
							{total.toLocaleString()}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{title ?? "Total"}
						</p>
					</div>
				</div>
				{showLabels && (
					<div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-2.5 py-2">
						{processedData.map((entry, index) => (
							<button
								className={cn(
									"flex items-center gap-1.5 rounded px-1 transition-opacity duration-150",
									activeIndex !== -1 && activeIndex !== index && "opacity-50"
								)}
								key={`${id}-legend-${entry.name}`}
								onMouseEnter={() => setActiveIndex(index)}
								onMouseLeave={() => setActiveIndex(-1)}
								type="button"
							>
								<div
									className="size-2 rounded-full"
									style={{ backgroundColor: entry.color }}
								/>
								<span className="text-muted-foreground text-xs">
									{entry.name}
								</span>
								<span className="font-medium text-foreground text-xs tabular-nums">
									{(entry.percent == null || Number.isNaN(entry.percent)
										? 0
										: entry.percent
									).toFixed(0)}
									%
								</span>
							</button>
						))}
					</div>
				)}
			</Card>
		);
	}
);

MiniPieChart.displayName = "MiniPieChart";

export { MiniPieChart };
