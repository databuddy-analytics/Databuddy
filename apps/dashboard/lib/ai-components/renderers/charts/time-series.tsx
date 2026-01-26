"use client";

import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Line,
	LineChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ChartComponentProps } from "../../types";

const COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
];

export interface TimeSeriesProps extends ChartComponentProps {
	variant: "line" | "bar" | "area";
	data: Record<string, string | number>[];
	series: string[];
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

export function TimeSeriesRenderer({
	variant,
	title,
	data,
	series,
	className,
}: TimeSeriesProps) {
	const id = `ai-chart-${Math.random().toString(36).slice(2, 9)}`;
	const getColor = (idx: number) => COLORS[idx % COLORS.length];

	const tooltipContent = ({
		active,
		payload,
		label,
	}: {
		active?: boolean;
		payload?: Array<{ value?: number; dataKey?: string; color?: string }>;
		label?: string;
	}) =>
		active && payload?.length ? (
			<div className="rounded border bg-popover px-2 py-1.5 shadow-lg">
				<p className="text-[10px] text-muted-foreground">{label}</p>
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
		) : null;

	const cursorStyle = {
		stroke: "var(--chart-color, var(--chart-1))",
		strokeWidth: 1,
		strokeDasharray: "4 4",
	};

	const renderChart = () => {
		const chartProps = {
			data,
			margin: { top: 5, right: 5, left: 5, bottom: 5 },
		};

		if (variant === "bar") {
			return (
				<BarChart {...chartProps}>
					<defs>
						{series.map((key, idx) => (
							<linearGradient
								id={`${id}-gradient-${key}`}
								key={key}
								x1="0"
								x2="0"
								y1="0"
								y2="1"
							>
								<stop offset="5%" stopColor={getColor(idx)} stopOpacity={0.8} />
								<stop
									offset="95%"
									stopColor={getColor(idx)}
									stopOpacity={0.1}
								/>
							</linearGradient>
						))}
					</defs>
					<XAxis
						axisLine={false}
						dataKey="x"
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={35}
					/>
					<Tooltip
						content={tooltipContent}
						cursor={{ fill: "var(--chart-1)", fillOpacity: 0.1 }}
					/>
					{series.map((key) => (
						<Bar
							dataKey={key}
							fill={`url(#${id}-gradient-${key})`}
							key={key}
							radius={[2, 2, 0, 0]}
						/>
					))}
				</BarChart>
			);
		}

		if (variant === "line") {
			return (
				<LineChart {...chartProps}>
					<XAxis
						axisLine={false}
						dataKey="x"
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={35}
					/>
					<Tooltip content={tooltipContent} cursor={cursorStyle} />
					{series.map((key, idx) => (
						<Line
							activeDot={{ r: 3 }}
							dataKey={key}
							dot={false}
							key={key}
							stroke={getColor(idx)}
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2.5}
							type="monotone"
						/>
					))}
				</LineChart>
			);
		}

		return (
			<AreaChart {...chartProps}>
				<defs>
					{series.map((key, idx) => (
						<linearGradient
							id={`${id}-gradient-${key}`}
							key={key}
							x1="0"
							x2="0"
							y1="0"
							y2="1"
						>
							<stop offset="5%" stopColor={getColor(idx)} stopOpacity={0.8} />
							<stop offset="95%" stopColor={getColor(idx)} stopOpacity={0.1} />
						</linearGradient>
					))}
				</defs>
				<XAxis
					axisLine={false}
					dataKey="x"
					tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
					tickLine={false}
				/>
				<YAxis
					axisLine={false}
					tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
					tickLine={false}
					width={35}
				/>
				<Tooltip content={tooltipContent} cursor={cursorStyle} />
				{series.map((key, idx) => (
					<Area
						activeDot={{ r: 3 }}
						dataKey={key}
						dot={false}
						fill={`url(#${id}-gradient-${key})`}
						key={key}
						stroke={getColor(idx)}
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2.5}
						type="monotone"
					/>
				))}
			</AreaChart>
		);
	};

	return (
		<Card className={className ?? "gap-0 overflow-hidden border bg-card p-0"}>
			<div className="dotted-bg bg-accent p-3">
				<ResponsiveContainer height={180} width="100%">
					{renderChart()}
				</ResponsiveContainer>
			</div>
			{title && (
				<div className="flex items-center gap-2.5 border-t px-3 py-2.5">
					<p className="min-w-0 flex-1 truncate font-semibold text-sm">
						{title}
					</p>
					<div className="flex shrink-0 flex-wrap gap-1.5">
						{series.map((key, idx) => (
							<div
								className="flex items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5"
								key={key}
							>
								<div
									className="size-2 rounded"
									style={{ backgroundColor: getColor(idx) }}
								/>
								<span className="text-[10px] text-muted-foreground">{key}</span>
							</div>
						))}
					</div>
				</div>
			)}
		</Card>
	);
}
