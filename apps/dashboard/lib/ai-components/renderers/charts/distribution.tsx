"use client";

import { useCallback, useState } from "react";
import {
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Sector,
	Tooltip,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ChartComponentProps } from "../../types";

const COLORS = [
	"#3b82f6", // Blue
	"#10b981", // Green
	"#f59e0b", // Amber
	"#ef4444", // Red
	"#8b5cf6", // Purple
	"#ec4899", // Pink
];

export interface DistributionProps extends ChartComponentProps {
	variant: "pie" | "donut";
	data: Array<{ name: string; value: number }>;
}

const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
};

const renderActiveShape = (props: {
	cx: number;
	cy: number;
	innerRadius: number;
	outerRadius: number;
	startAngle: number;
	endAngle: number;
	fill: string;
}) => {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
		props;
	return (
		<g>
			<Sector
				cx={cx}
				cy={cy}
				endAngle={endAngle}
				fill={fill}
				innerRadius={innerRadius}
				outerRadius={outerRadius + 4}
				startAngle={startAngle}
			/>
		</g>
	);
};

export function DistributionRenderer({
	variant,
	title,
	data,
	className,
}: DistributionProps) {
	const [activeIndex, setActiveIndex] = useState(-1);
	const total = data.reduce((sum, item) => sum + item.value, 0);
	const getColor = (idx: number) => COLORS[idx % COLORS.length];

	const onPieEnter = useCallback((_: unknown, index: number) => {
		setActiveIndex(index);
	}, []);

	const onPieLeave = useCallback(() => {
		setActiveIndex(-1);
	}, []);

	return (
		<Card className={className ?? "gap-0 overflow-hidden border bg-card p-0"}>
			<div className="dotted-bg bg-accent p-4">
				<ResponsiveContainer height={200} width="100%">
					<PieChart>
						<Pie
							activeIndex={activeIndex}
							activeShape={renderActiveShape}
							cx="50%"
							cy="50%"
							data={data}
							dataKey="value"
							innerRadius={variant === "donut" ? 50 : 0}
							nameKey="name"
							onMouseEnter={onPieEnter}
							onMouseLeave={onPieLeave}
							outerRadius={80}
							paddingAngle={0}
						>
							{data.map((_, index) => (
								<Cell
									fill={getColor(index)}
									key={`cell-${index}`}
									stroke="var(--background)"
									strokeWidth={1}
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
								const percentage = total > 0 ? (item.value / total) * 100 : 0;
								return (
									<div className="rounded border bg-popover px-2 py-1.5 shadow-lg">
										<p className="font-semibold text-foreground text-xs">
											{item.name}
										</p>
										<p className="text-muted-foreground text-xs">
											{formatNumber(item.value)} ({percentage.toFixed(1)}%)
										</p>
									</div>
								);
							}}
							wrapperStyle={{ outline: "none" }}
						/>
					</PieChart>
				</ResponsiveContainer>
			</div>
			<div className="flex items-center gap-2.5 border-t px-3 py-2.5">
				<p className="min-w-0 flex-1 truncate font-semibold text-sm">
					{title || "Distribution"}
				</p>
				<div className="flex shrink-0 flex-wrap gap-1.5">
					{data.map((item, idx) => (
						<div
							className="flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5"
							key={item.name}
						>
							<div
								className="size-2 rounded"
								style={{ backgroundColor: getColor(idx) }}
							/>
							<span className="text-[10px] text-muted-foreground">
								{item.name}
							</span>
						</div>
					))}
				</div>
			</div>
		</Card>
	);
}
