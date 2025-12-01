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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorChartTooltip } from "./error-chart-tooltip";

const ResponsiveContainer = dynamic(
	() => import("recharts").then((mod) => mod.ResponsiveContainer),
	{ ssr: false }
);
const AreaChart = dynamic(
	() => import("recharts").then((mod) => mod.AreaChart),
	{ ssr: false }
);

type ErrorTrendsChartProps = {
	errorChartData: Array<{
		date: string;
		"Total Errors": number;
		"Affected Users": number;
	}>;
};

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

	const handleMouseDown = (e: any) => {
		if (!e?.activeLabel) {
			return;
		}
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: any) => {
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

	if (!errorChartData.length) {
		return (
			<Card className="h-full">
				<CardContent>
					<TableEmptyState
						description="Not enough data to display a trend chart. Error trends will appear here when your website encounters errors."
						icon={<BugIcon className="size-6 text-accent" />}
						title="No error trend data"
					/>
				</CardContent>
			</Card>
		);
	}

	// Get the error metrics with proper colors from the constants
	const totalErrorsMetric = METRICS.find((m) => m.key === "total_errors");
	const affectedUsersMetric = METRICS.find((m) => m.key === "affected_users");

	const totalErrorsColor =
		totalErrorsMetric?.color || METRIC_COLORS.bounce_rate.primary;
	const affectedUsersColor =
		affectedUsersMetric?.color || METRIC_COLORS.session_duration.primary;

	return (
		<div className="flex h-full flex-col rounded-lg border border-sidebar-border bg-sidebar/10 shadow-sm">
			<div className="flex items-center justify-between border-sidebar-border border-b p-4">
				<div>
					<h3 className="font-semibold text-base">Error Trends</h3>
					<p className="text-muted-foreground text-xs">
						Error occurrences and impact over time
					</p>
				</div>
				<div className="flex items-center gap-2">
					{isZoomed && (
						<Button
							className="h-7 px-2 text-xs"
							onClick={resetZoom}
							size="sm"
							variant="outline"
						>
							<ArrowCounterClockwiseIcon
								className="mr-1 h-3 w-3"
								size={16}
								weight="duotone"
							/>
							Reset Zoom
						</Button>
					)}
					<div className="text-muted-foreground text-xs">Drag to zoom</div>
				</div>
			</div>
			<div className="flex-1 p-2">
				<div
					className="relative select-none"
					style={{
						width: "100%",
						height: 300,
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
										stopOpacity={0.25}
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
										stopOpacity={0.25}
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
									fill="var(--sidebar-ring)"
									fillOpacity={0.15}
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
