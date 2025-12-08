"use client";

import { ArrowCounterClockwiseIcon, ClockIcon } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import {
	Area,
	CartesianGrid,
	Legend,
	ReferenceArea,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableEmptyState } from "@/components/table/table-empty-state";
import dayjs from "dayjs";

const ResponsiveContainer = dynamic(
	() => import("recharts").then((mod) => mod.ResponsiveContainer),
	{ ssr: false }
);
const AreaChart = dynamic(
	() => import("recharts").then((mod) => mod.AreaChart),
	{ ssr: false }
);

type LatencyDataPoint = {
	date: string;
	"Response Time (p50)": number;
	"Response Time (p95)": number;
	"TTFB (p50)": number;
	"TTFB (p95)": number;
};

type LatencyChartProps = {
	data: LatencyDataPoint[];
	isLoading?: boolean;
};

const formatLatency = (value: number) => {
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}s`;
	}
	return `${Math.round(value)}ms`;
};

const CustomTooltip = ({ active, payload, label }: {
	active?: boolean;
	payload?: Array<{
		dataKey: string;
		value: number;
		color: string;
	}>;
	label?: string;
}) => {
	if (!active || !payload || !payload.length) {
		return null;
	}

	return (
		<div className="rounded border bg-background p-2 shadow-lg">
			<p className="mb-2 font-semibold text-xs">
				{dayjs(label).format("MMM D, YYYY HH:mm")}
			</p>
			<div className="space-y-1">
				{payload.map((entry, index) => (
					<div
						key={index}
						className="flex items-center gap-2 text-xs"
					>
						<div
							className="size-2 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="text-muted-foreground">{entry.dataKey}:</span>
						<span className="font-mono font-semibold">
							{formatLatency(entry.value)}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};

export function LatencyChart({ data, isLoading = false }: LatencyChartProps) {
	const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
	const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
	const [zoomedData, setZoomedData] = useState<LatencyDataPoint[] | null>(null);

	const isZoomed = zoomedData !== null;
	const displayData = zoomedData || data;

	const resetZoom = useCallback(() => {
		setRefAreaLeft(null);
		setRefAreaRight(null);
		setZoomedData(null);
	}, []);

	const handleMouseDown = (e: { activeLabel?: string }) => {
		if (!e?.activeLabel) {
			return;
		}
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: { activeLabel?: string }) => {
		if (!(refAreaLeft && e?.activeLabel)) {
			return;
		}
		setRefAreaRight(e.activeLabel);
	};

	const handleMouseUp = () => {
		if (!refAreaLeft) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight || refAreaLeft;

		const leftIndex = data.findIndex((d) => d.date === refAreaLeft);
		const rightIndex = data.findIndex((d) => d.date === rightBoundary);

		if (leftIndex === -1 || rightIndex === -1) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const [startIndex, endIndex] =
			leftIndex < rightIndex
				? [leftIndex, rightIndex]
				: [rightIndex, leftIndex];

		const zoomed = data.slice(startIndex, endIndex + 1);
		setZoomedData(zoomed);

		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	// Calculate summary stats
	const avgResponseP50 = displayData.length > 0
		? displayData.reduce((sum, d) => sum + d["Response Time (p50)"], 0) /
			displayData.length
		: 0;
	const avgResponseP95 = displayData.length > 0
		? displayData.reduce((sum, d) => sum + d["Response Time (p95)"], 0) /
			displayData.length
		: 0;
	const avgTtfbP50 = displayData.length > 0
		? displayData.reduce((sum, d) => sum + d["TTFB (p50)"], 0) /
			displayData.length
		: 0;
	const avgTtfbP95 = displayData.length > 0
		? displayData.reduce((sum, d) => sum + d["TTFB (p95)"], 0) /
			displayData.length
		: 0;

	if (isLoading) {
		return (
			<>
				<div className="border-b px-4 py-3">
					<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
						Latency Trends
					</h3>
				</div>
				<div className="p-4">
					<div className="h-[260px] animate-pulse rounded bg-muted" />
				</div>
			</>
		);
	}

	if (!data.length) {
		return (
			<>
				<div className="border-b px-4 py-3">
					<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
						Latency Trends
					</h3>
				</div>
				<div className="flex items-center justify-center p-12">
					<TableEmptyState
						description="Not enough data to display latency trends. Latency metrics will appear here once monitoring data is available."
						icon={<ClockIcon className="size-6 text-muted-foreground" />}
						title="No latency data"
					/>
				</div>
			</>
		);
	}

	return (
		<>
			{/* Header */}
			<div className="flex items-center justify-between border-b px-4 py-3">
				<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
					Latency Trends
				</h3>
				<div className="flex items-center gap-2">
					{isZoomed && (
						<Button
							className="h-7 gap-1 px-2 text-xs"
							onClick={resetZoom}
							size="sm"
							variant="outline"
						>
							<ArrowCounterClockwiseIcon className="size-3" weight="bold" />
							Reset
						</Button>
					)}
					<Badge variant="gray">
						<span className="font-mono text-[10px]">Drag to zoom</span>
					</Badge>
				</div>
			</div>

			{/* Summary Stats */}
			<div className="grid grid-cols-4 gap-3 border-b bg-accent/20 p-3">
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Response p50
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{formatLatency(avgResponseP50)}
					</p>
				</div>
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						Response p95
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{formatLatency(avgResponseP95)}
					</p>
				</div>
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						TTFB p50
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{formatLatency(avgTtfbP50)}
					</p>
				</div>
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
						TTFB p95
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{formatLatency(avgTtfbP95)}
					</p>
				</div>
			</div>

			{/* Chart */}
			<div className="p-4">
				<div
					className="relative select-none"
					style={{
						width: "100%",
						height: 260,
						userSelect: refAreaLeft ? "none" : "auto",
						WebkitUserSelect: refAreaLeft ? "none" : "auto",
					}}
				>
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={displayData}
							margin={{
								top: 10,
								right: 10,
								left: 0,
								bottom: displayData.length > 5 ? 35 : 5,
							}}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
						>
							<defs>
								<linearGradient id="colorResponseP50" x1="0" x2="0" y1="0" y2="1">
									<stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
									<stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
								</linearGradient>
								<linearGradient id="colorResponseP95" x1="0" x2="0" y1="0" y2="1">
									<stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
									<stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05} />
								</linearGradient>
								<linearGradient id="colorTtfbP50" x1="0" x2="0" y1="0" y2="1">
									<stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
									<stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
								</linearGradient>
								<linearGradient id="colorTtfbP95" x1="0" x2="0" y1="0" y2="1">
									<stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
									<stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
								</linearGradient>
							</defs>
							<CartesianGrid
								stroke="var(--border)"
								strokeDasharray="3 3"
								strokeOpacity={0.5}
								vertical={false}
							/>
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
								tickFormatter={(value) => dayjs(value).format("MMM D")}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
								tickFormatter={(value) => formatLatency(value)}
								tickLine={false}
								width={50}
							/>
							<Tooltip
								content={<CustomTooltip />}
								wrapperStyle={{ outline: "none" }}
							/>
							<Legend
								iconSize={8}
								iconType="circle"
								wrapperStyle={{
									fontSize: "10px",
									paddingTop: "5px",
									bottom: displayData.length > 5 ? 20 : 0,
								}}
							/>
							{refAreaLeft && refAreaRight && (
								<ReferenceArea
									fill="var(--primary)"
									fillOpacity={0.1}
									stroke="var(--primary)"
									strokeOpacity={0.3}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}
							<Area
								dataKey="Response Time (p50)"
								fill="url(#colorResponseP50)"
								fillOpacity={1}
								name="Response Time (p50)"
								stroke="#3b82f6"
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="Response Time (p95)"
								fill="url(#colorResponseP95)"
								fillOpacity={1}
								name="Response Time (p95)"
								stroke="#8b5cf6"
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="TTFB (p50)"
								fill="url(#colorTtfbP50)"
								fillOpacity={1}
								name="TTFB (p50)"
								stroke="#10b981"
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="TTFB (p95)"
								fill="url(#colorTtfbP95)"
								fillOpacity={1}
								name="TTFB (p95)"
								stroke="#f59e0b"
								strokeWidth={2}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</>
	);
}
