"use client";

import { useId } from "react";
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
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import { Card } from "@/components/ui/card";
import { CHART_COLORS } from "@/lib/ai-components/renderers/config";
import dayjs from "@/lib/dayjs";
import type { ChartComponentProps } from "../../types";

export interface TimeSeriesProps extends ChartComponentProps {
	variant: "line" | "bar" | "area" | "stacked-bar";
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

const formatDateTick = (value: string) => {
	const parsed = dayjs(value);
	if (!parsed.isValid()) {
		return value;
	}
	return parsed.format("MMM D");
};

const formatDateLabel = (value: string) => {
	const parsed = dayjs(value);
	if (!parsed.isValid()) {
		return value;
	}
	return parsed.format("MMM D, YYYY");
};

export function TimeSeriesRenderer({
	variant,
	title,
	data,
	series,
	className,
}: TimeSeriesProps) {
	const rawId = useId();
	const id = rawId.replace(/:/g, "");
	const getColor = (idx: number) => CHART_COLORS[idx % CHART_COLORS.length];

	const tooltipContent = ({
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
	}) =>
		active && payload?.length ? (
			<div className="rounded border bg-popover px-2 py-1.5 shadow-lg">
				<p className="text-[10px] text-muted-foreground">
					{formatDateLabel(label ?? "")}
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
		) : null;

	const cursorStyle = {
		stroke: CHART_COLORS[0],
		strokeWidth: 1,
		strokeDasharray: "4 4",
	};

	const chartProps = {
		data,
		margin: { top: 5, right: 5, left: 0, bottom: 0 },
	};

	const renderChart = () => {
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
						tickFormatter={formatDateTick}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						domain={["dataMin", "dataMax + 5"]}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={30}
					/>
					<Tooltip
						content={tooltipContent}
						cursor={{ fill: getColor(0), fillOpacity: 0.1 }}
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

		if (variant === "stacked-bar") {
			return (
				<BarChart {...chartProps}>
					<XAxis
						axisLine={false}
						dataKey="x"
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickFormatter={formatDateTick}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						domain={["dataMin", "dataMax + 5"]}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={30}
					/>
					<Tooltip
						content={tooltipContent}
						cursor={{ fill: getColor(0), fillOpacity: 0.1 }}
					/>
					{series.map((key, idx) => (
						<Bar
							dataKey={key}
							fill={getColor(idx)}
							key={key}
							radius={idx === series.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
							stackId="stack"
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
						tickFormatter={formatDateTick}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						domain={["dataMin", "dataMax + 5"]}
						tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
						tickLine={false}
						width={30}
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
					tickFormatter={formatDateTick}
					tickLine={false}
				/>
				<YAxis
					axisLine={false}
					domain={["dataMin", "dataMax + 5"]}
					tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
					tickLine={false}
					width={30}
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
			<div className="dotted-bg bg-accent p-0">
				<ChartErrorBoundary fallbackClassName="h-[180px] w-full">
					<ResponsiveContainer height={180} width="100%">
						{renderChart()}
					</ResponsiveContainer>
				</ChartErrorBoundary>
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
