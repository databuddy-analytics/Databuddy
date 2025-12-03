"use client";

import dayjs from "dayjs";
import { memo } from "react";
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
import { useChartPreferences } from "@/hooks/use-chart-preferences";

type MiniChartProps = {
	data: { date: string; value: number }[];
	id: string;
	days?: number;
};

const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
};

const MiniChart = memo(({ data, id, days = 7 }: MiniChartProps) => {
	const { chartType, chartStepType } = useChartPreferences("website-list");

	const tooltipContent = ({
		active,
		payload,
		label,
	}: {
		active?: boolean;
		payload?: Array<{ value?: number }>;
		label?: string;
	}) =>
		active && payload?.[0]?.value !== undefined ? (
			<div className="rounded border border-border/50 bg-popover/95 px-3 py-2 shadow-lg backdrop-blur-sm">
				<p className="text-[10px] text-muted-foreground">
					{dayjs(label as string).format("ddd, MMM D")}
				</p>
				<p className="font-semibold text-popover-foreground text-sm tabular-nums">
					{formatNumber(payload[0].value)} views
				</p>
			</div>
		) : null;

	const cursorStyle = {
		stroke: "var(--chart-color)",
		strokeWidth: 1,
		strokeDasharray: "4 4",
	};

	const gradientId = `gradient-${id}-${days}`;
	const gradientDef = (
		<defs>
			<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
				<stop offset="5%" stopColor="var(--chart-color)" stopOpacity={0.8} />
				<stop offset="95%" stopColor="var(--chart-color)" stopOpacity={0.1} />
			</linearGradient>
		</defs>
	);

	const chartProps = {
		data,
		margin: { top: 5, right: 0, left: 0, bottom: 0 },
		"aria-label": `Mini chart showing views for the last ${days} days`,
		role: "img" as const,
	};

	if (chartType === "bar") {
		return (
			<div className="chart-container rounded">
				<ResponsiveContainer height={112} width="100%">
					<BarChart {...chartProps}>
						<title>{`Views over time (last ${days} days)`}</title>
						{gradientDef}
						<XAxis dataKey="date" hide />
						<YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
						<Tooltip
							content={tooltipContent}
							cursor={{ fill: "var(--chart-color)", fillOpacity: 0.1 }}
						/>
						<Bar
							animationDuration={600}
							animationEasing="ease-out"
							dataKey="value"
							fill={`url(#${gradientId})`}
							isAnimationActive
							radius={[2, 2, 0, 0]}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>
		);
	}

	if (chartType === "line") {
		return (
			<div className="chart-container rounded">
				<ResponsiveContainer height={112} width="100%">
					<LineChart {...chartProps}>
						<title>{`Views over time (last ${days} days)`}</title>
						<XAxis dataKey="date" hide />
						<YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
						<Tooltip content={tooltipContent} cursor={cursorStyle} />
						<Line
							activeDot={{ r: 3 }}
							animationDuration={600}
							animationEasing="ease-out"
							dataKey="value"
							dot={false}
							isAnimationActive
							stroke="var(--chart-color)"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={2.5}
							type={chartStepType}
						/>
					</LineChart>
				</ResponsiveContainer>
			</div>
		);
	}

	// Default: area chart
	return (
		<div className="chart-container rounded">
			<ResponsiveContainer height={112} width="100%">
				<AreaChart {...chartProps}>
					<title>{`Views over time (last ${days} days)`}</title>
					{gradientDef}
					<XAxis dataKey="date" hide />
					<YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
					<Tooltip content={tooltipContent} cursor={cursorStyle} />
					<Area
						activeDot={{ r: 3 }}
						animationDuration={600}
						animationEasing="ease-out"
						dataKey="value"
						dot={false}
						fill={`url(#${gradientId})`}
						isAnimationActive
						stroke="var(--chart-color)"
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={2.5}
						type={chartStepType}
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
});

MiniChart.displayName = "MiniChart";

export default MiniChart;
