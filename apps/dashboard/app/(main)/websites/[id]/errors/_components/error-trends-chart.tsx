"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Chart } from "@/components/ui/composables/chart";
import {
	chartAxisTickDefault,
	chartAxisYWidthCompact,
	chartCartesianGridDefault,
	chartRechartsLegendIconSize,
	chartRechartsLegendStaticLabelClassName,
	chartRechartsLegendStaticWrapperStyleMerge,
} from "@/lib/chart-presentation";
import { ArrowCounterClockwiseIcon, BugIcon } from "@databuddy/ui/icons";
import { Button, Card, EmptyState, Skeleton } from "@databuddy/ui";

const { Area, CartesianGrid, Legend, ReferenceArea, Tooltip, XAxis, YAxis } =
	Chart.Recharts;

const ERROR_COLOR = "var(--destructive)";
const USER_COLOR = "var(--chart-2)";

const TOOLTIP_METRICS = [
	{ key: "Total Errors", label: "Total Errors", color: ERROR_COLOR },
	{ key: "Affected Users", label: "Affected Users", color: USER_COLOR },
];

const ResponsiveContainer = dynamic(
	() =>
		import("@/components/ui/composables/chart").then(
			(mod) => mod.Chart.Recharts.ResponsiveContainer
		),
	{ ssr: false }
);
const AreaChart = dynamic(
	() =>
		import("@/components/ui/composables/chart").then(
			(mod) => mod.Chart.Recharts.AreaChart
		),
	{ ssr: false }
);

interface ErrorTrendsChartProps {
	errorChartData: Array<{
		date: string;
		"Total Errors": number;
		"Affected Users": number;
	}>;
	isLoading?: boolean;
}

export const ErrorTrendsChart = ({
	errorChartData,
	isLoading,
}: ErrorTrendsChartProps) => {
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

		setZoomedData(errorChartData.slice(startIndex, endIndex + 1));
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

	if (isLoading) {
		return (
			<Card className="h-full">
				<Card.Header className="py-3">
					<div className="flex items-center gap-2">
						<BugIcon className="size-4 text-muted-foreground" />
						<Card.Title className="text-sm">Error Trends</Card.Title>
					</div>
				</Card.Header>
				<Skeleton className="h-[320px] w-full rounded-none" />
			</Card>
		);
	}

	if (!errorChartData.length) {
		return (
			<Card className="h-full">
				<Card.Header className="py-3">
					<div className="flex items-center gap-2">
						<BugIcon className="size-4 text-muted-foreground" />
						<Card.Title className="text-sm">Error Trends</Card.Title>
					</div>
				</Card.Header>
				<Card.Content className="flex-1">
					<EmptyState
						description="Error trends will appear here when your website encounters errors."
						icon={<BugIcon />}
						title="No error trend data"
					/>
				</Card.Content>
			</Card>
		);
	}

	return (
		<Card className="h-full">
			<Card.Header className="flex-row items-center justify-between gap-3 py-3">
				<div className="flex items-center gap-3">
					<div className="flex size-7 shrink-0 items-center justify-center rounded bg-destructive/10">
						<BugIcon className="size-4 text-destructive" />
					</div>
					<div className="flex items-baseline gap-4">
						<div>
							<p className="font-semibold text-foreground text-lg tabular-nums leading-tight">
								{totalErrors.toLocaleString()}
							</p>
							<p className="text-muted-foreground text-xs">errors</p>
						</div>
						<div>
							<p className="font-semibold text-foreground text-lg tabular-nums leading-tight">
								{totalAffectedUsers.toLocaleString()}
							</p>
							<p className="text-muted-foreground text-xs">affected users</p>
						</div>
					</div>
				</div>
				{isZoomed && (
					<Button
						className="h-7 gap-1 px-2"
						onClick={resetZoom}
						size="sm"
						variant="secondary"
					>
						<ArrowCounterClockwiseIcon className="size-3" weight="bold" />
						Reset
					</Button>
				)}
			</Card.Header>

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
							<CartesianGrid {...chartCartesianGridDefault} />
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={chartAxisTickDefault}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={chartAxisTickDefault}
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
								width={chartAxisYWidthCompact}
							/>
							<Tooltip
								content={({ active, label, payload }) => (
									<Chart.Tooltip
										active={active}
										entries={Chart.createTooltipEntries(
											payload as Array<{
												dataKey: string;
												value: number;
												color: string;
											}>,
											TOOLTIP_METRICS
										)}
										formatLabelAction={Chart.formatTooltipDate}
										label={label as string}
									/>
								)}
								wrapperStyle={{ outline: "none" }}
							/>
							<Legend
								formatter={(value) => (
									<span className={chartRechartsLegendStaticLabelClassName}>
										{value}
									</span>
								)}
								iconSize={chartRechartsLegendIconSize}
								iconType="circle"
								wrapperStyle={chartRechartsLegendStaticWrapperStyleMerge({
									bottom: displayData.length > 5 ? 20 : 0,
								})}
							/>
							{refAreaLeft && refAreaRight && (
								<ReferenceArea
									fill="var(--chart-1)"
									fillOpacity={0.1}
									stroke="var(--chart-1)"
									strokeOpacity={0.3}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}
							<Area
								dataKey="Total Errors"
								fill={ERROR_COLOR}
								fillOpacity={0.15}
								name="Total Errors"
								stroke={ERROR_COLOR}
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="Affected Users"
								fill={USER_COLOR}
								fillOpacity={0.15}
								name="Affected Users"
								stroke={USER_COLOR}
								strokeWidth={2}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</Card>
	);
};
