"use client";

import { ArrowCounterClockwiseIcon, BugIcon } from "@phosphor-icons/react";
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
import { METRIC_COLORS, METRICS } from "@/components/charts/metrics-constants";
import { TableEmptyState } from "@/components/table/table-empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorChartTooltip } from "./error-chart-tooltip";

const ResponsiveContainer = dynamic(
	() => import("recharts").then((mod) => mod.ResponsiveContainer),
	{ ssr: false }
);
const AreaChart = dynamic(
	() => import("recharts").then((mod) => mod.AreaChart),
	{ ssr: false }
);

interface ErrorTrendsChartProps {
	errorChartData: Array<{
		date: string;
		"Total Errors": number;
		"Affected Users": number;
	}>;
}

export const ErrorTrendsChart = ({ errorChartData }: ErrorTrendsChartProps) => {
	const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
	const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
	const [zoomedData, setZoomedData] = useState<Array<{
		date: string;
		"Total Errors": number;
		"Affected Users": number;
	}> | null>(null);

	const isZoomed = zoomedData !== null;
	const displayData = zoomedData || errorChartData;

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

		const leftIndex = errorChartData.findIndex((d) => d.date === refAreaLeft);
		const rightIndex = errorChartData.findIndex(
			(d) => d.date === rightBoundary
		);

		if (leftIndex === -1 || rightIndex === -1) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const [startIndex, endIndex] =
			leftIndex < rightIndex
				? [leftIndex, rightIndex]
				: [rightIndex, leftIndex];

		const zoomed = errorChartData.slice(startIndex, endIndex + 1);
		setZoomedData(zoomed);

		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	const totalErrors = displayData.reduce(
		(sum, d) => sum + d["Total Errors"],
		0
	);
	const totalAffectedUsers = displayData.reduce(
		(sum, d) => sum + d["Affected Users"],
		0
	);

	if (!errorChartData.length) {
		return (
			<div className="flex h-full flex-col rounded border bg-card">
				<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
					<div className="flex size-8 items-center justify-center rounded bg-accent">
						<BugIcon
							className="size-4 text-muted-foreground"
							weight="duotone"
						/>
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-foreground text-sm sm:text-base">
							Error Trends
						</h2>
						<p className="text-muted-foreground text-xs">No data available</p>
					</div>
				</div>
				<div className="flex-1 p-3 sm:p-4">
					<TableEmptyState
						description="Error trends will appear here when your website encounters errors."
						icon={<BugIcon className="size-6 text-muted-foreground" />}
						title="No error trend data"
					/>
				</div>
			</div>
		);
	}

	const totalErrorsMetric = METRICS.find((m) => m.key === "total_errors");
	const affectedUsersMetric = METRICS.find((m) => m.key === "affected_users");

	const totalErrorsColor =
		totalErrorsMetric?.color || METRIC_COLORS.bounce_rate.primary;
	const affectedUsersColor =
		affectedUsersMetric?.color || METRIC_COLORS.session_duration.primary;

	return (
		<div className="flex h-full flex-col rounded border bg-card">
			<div className="flex flex-col items-start justify-between gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 sm:py-3">
				<div className="flex items-center gap-3">
					<div className="flex size-8 items-center justify-center rounded bg-destructive/10">
						<BugIcon className="size-4 text-destructive" weight="duotone" />
					</div>
					<div className="min-w-0">
						<h2 className="font-semibold text-foreground text-sm sm:text-base">
							Error Trends
						</h2>
						<p className="text-muted-foreground text-xs">
							Error occurrences over time
						</p>
					</div>
				</div>
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

			<div className="grid grid-cols-2 gap-3 border-b bg-muted/30 p-3">
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase">
						Total Errors
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{totalErrors.toLocaleString()}
					</p>
				</div>
				<div className="space-y-0.5">
					<p className="font-mono text-[10px] text-muted-foreground uppercase">
						Affected Users
					</p>
					<p className="font-semibold text-foreground text-lg tabular-nums">
						{totalAffectedUsers.toLocaleString()}
					</p>
				</div>
			</div>

			<div className="flex-1 overflow-x-auto p-2">
				<div
					className="relative select-none"
					style={{
						width: "100%",
						height: 260,
						minWidth: 300,
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
								<linearGradient
									id="colorTotalErrors"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor={totalErrorsColor}
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor={totalErrorsColor}
										stopOpacity={0.05}
									/>
								</linearGradient>
								<linearGradient
									id="colorAffectedUsers"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor={affectedUsersColor}
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor={affectedUsersColor}
										stopOpacity={0.05}
									/>
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
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
								tickFormatter={(value) => {
									if (value >= 1_000_000) {
										return `${(value / 1_000_000).toFixed(1)}M`;
									}
									if (value >= 1000) {
										return `${(value / 1000).toFixed(1)}k`;
									}
									return value.toString();
								}}
								tickLine={false}
								width={30}
							/>
							<Tooltip
								content={<ErrorChartTooltip />}
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
								dataKey="Total Errors"
								fill="url(#colorTotalErrors)"
								fillOpacity={1}
								name="Total Errors"
								stroke={totalErrorsColor}
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="Affected Users"
								fill="url(#colorAffectedUsers)"
								fillOpacity={1}
								name="Affected Users"
								stroke={affectedUsersColor}
								strokeWidth={2}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
};
