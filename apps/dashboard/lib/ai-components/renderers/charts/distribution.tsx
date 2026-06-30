"use client";

import { useCallback, useState } from "react";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { Chart } from "@/components/ui/composables/chart";
import { Card, Skeleton } from "@databuddy/ui";
import { ChartPieIcon } from "@databuddy/ui/icons";
import {
	chartLegendPillDotClassName,
	chartLegendPillLabelClassName,
	chartLegendPillRowClassName,
	chartSeriesColorAtIndex,
	chartTooltipSingleShellClassName,
} from "@/lib/chart-presentation";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { ChartComponentProps } from "../../types";

const { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } =
	Chart.Recharts;

export interface DistributionProps extends ChartComponentProps {
	data: Array<{ name: string; value: number }>;
	variant: "pie" | "donut";
}

const PLOT_HEIGHT = 220;

const renderActiveShape = (props: {
	cx: number;
	cy: number;
	innerRadius: number;
	outerRadius: number;
	startAngle: number;
	endAngle: number;
	fill: string;
}) => (
	<g>
		<Sector
			cx={props.cx}
			cy={props.cy}
			endAngle={props.endAngle}
			fill={props.fill}
			innerRadius={props.innerRadius}
			outerRadius={props.outerRadius + 4}
			startAngle={props.startAngle}
		/>
	</g>
);

export function DistributionRenderer({
	variant,
	title,
	data,
	className,
	streaming,
}: DistributionProps) {
	const [activeIndex, setActiveIndex] = useState(-1);
	const total = data.reduce((sum, item) => sum + item.value, 0);

	const onPieEnter = useCallback((_: unknown, index: number) => {
		setActiveIndex(index);
	}, []);

	const onPieLeave = useCallback(() => {
		setActiveIndex(-1);
	}, []);

	const isSkeleton = data.length === 0;

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border-0 bg-secondary p-1",
				className
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center gap-2.5 rounded-md bg-background px-2.5 py-2">
					<div className="flex size-6 items-center justify-center rounded bg-accent">
						<ChartPieIcon
							className="size-3.5 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<p className="min-w-0 flex-1 truncate font-medium text-sm">
						{title ?? "Distribution"}
					</p>
					<div
						className={cn(
							"ml-auto min-w-0 flex-1 flex-wrap",
							chartLegendPillRowClassName
						)}
					>
						{data.map((item, idx) => (
							<div
								className={
									"flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1"
								}
								key={item.name}
							>
								<div
									className={chartLegendPillDotClassName}
									style={{ backgroundColor: chartSeriesColorAtIndex(idx) }}
								/>
								<span className={chartLegendPillLabelClassName}>
									{item.name}
								</span>
							</div>
						))}
					</div>
				</div>

				<div className="rounded-md bg-background px-3 py-3">
					<div className="dotted-bg overflow-hidden rounded bg-accent/90 p-4">
						{isSkeleton ? (
							<Skeleton className="mx-auto size-[160px] rounded-full" />
						) : (
							<ChartErrorBoundary
								fallbackClassName={`h-[${PLOT_HEIGHT}px] w-full`}
							>
								<ResponsiveContainer height={PLOT_HEIGHT} width="100%">
									<PieChart>
										<Pie
											activeIndex={activeIndex}
											activeShape={renderActiveShape as never}
											cx="50%"
											cy="50%"
											data={data}
											dataKey="value"
											innerRadius={variant === "donut" ? 50 : 0}
											isAnimationActive={!streaming}
											nameKey="name"
											onMouseEnter={onPieEnter}
											onMouseLeave={onPieLeave}
											outerRadius={80}
											paddingAngle={1}
										>
											{data.map((entry, index) => (
												<Cell
													fill={chartSeriesColorAtIndex(index)}
													key={entry.name}
													stroke="var(--background)"
													strokeWidth={2}
												/>
											))}
										</Pie>
										<Tooltip
											content={({ active, payload }) => {
												if (!(active && payload?.length)) {
													return null;
												}
												const item = payload[0];
												if (!item || typeof item.value !== "number") {
													return null;
												}
												const pct = total > 0 ? (item.value / total) * 100 : 0;
												return (
													<div className={chartTooltipSingleShellClassName}>
														<p className="font-medium text-foreground text-xs">
															{item.name}
														</p>
														<p className="text-muted-foreground text-xs tabular-nums">
															{formatNumber(item.value)} ({pct.toFixed(1)}%)
														</p>
													</div>
												);
											}}
											wrapperStyle={{ outline: "none" }}
										/>
									</PieChart>
								</ResponsiveContainer>
							</ChartErrorBoundary>
						)}
					</div>
				</div>
			</div>
		</Card>
	);
}
