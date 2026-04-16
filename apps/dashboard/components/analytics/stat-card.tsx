"use client";

import { MinusIcon } from "@phosphor-icons/react";
import { TrendDownIcon } from "@phosphor-icons/react";
import { TrendUpIcon } from "@phosphor-icons/react";
import type { ElementType } from "react";
import {
	Chart,
	type ChartCurveType,
	type ChartSeriesKind,
} from "@/components/ui/composables/chart";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import dayjs from "@/lib/dayjs";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface MiniChartDataPoint {
	date: string;
	value: number;
}

interface Trend {
	change?: number;
	current: number;
	currentPeriod: { start: string; end: string };
	previous: number;
	previousPeriod: { start: string; end: string };
}

export type StatCardDisplayMode = "compact" | "chart" | "text";

interface StatCardProps {
	chartData?: MiniChartDataPoint[];
	chartStepType?: ChartCurveType;
	chartType?: ChartSeriesKind;
	className?: string;
	description?: string;
	displayMode?: StatCardDisplayMode;
	formatChartValue?: (value: number) => string;
	formatValue?: (value: number) => string;
	icon?: ElementType;
	id?: string;
	invertTrend?: boolean;
	isLoading?: boolean;
	partialLastSegment?: boolean;
	showChart?: boolean;
	title: string;
	titleExtra?: React.ReactNode;
	trend?: Trend | number;
	value: string | number;
}

const formatTrendValue = (
	value: string | number,
	formatter?: (v: number) => string
) => {
	if (typeof value === "number") {
		if (formatter) {
			return formatter(value);
		}
		const safeValue = value == null || Number.isNaN(value) ? 0 : value;
		return Number.isInteger(safeValue)
			? formatNumber(safeValue)
			: safeValue.toFixed(1);
	}
	return value;
};

function TrendIndicator({
	value,
	invertColor = false,
	className,
}: {
	value: number;
	invertColor?: boolean;
	className?: string;
}) {
	if (value == null || Number.isNaN(value)) {
		return null;
	}

	const isPositive = value > 0;
	const isNegative = value < 0;
	const isNeutral = value === 0;

	const colorClass = isNeutral
		? "text-muted-foreground"
		: isPositive
			? invertColor
				? "text-destructive"
				: "text-success"
			: invertColor
				? "text-success"
				: "text-destructive";

	const Icon = isPositive
		? TrendUpIcon
		: isNegative
			? TrendDownIcon
			: MinusIcon;

	const safeValue = value == null || Number.isNaN(value) ? 0 : value;

	return (
		<span className={cn("flex items-center gap-1", colorClass, className)}>
			<Icon className="size-4" weight={isNeutral ? "regular" : "fill"} />
			<span className="font-semibold text-xs">
				{isPositive ? "+" : ""}
				{Math.abs(safeValue).toFixed(0)}%
			</span>
		</span>
	);
}

const MINI_CHART_HEIGHT = 102;

function MiniChart({
	data,
	id,
	formatChartValue,
	title,
	chartType = "area",
	chartStepType = "monotone",
	partialLastSegment = true,
}: {
	data: MiniChartDataPoint[];
	id: string;
	formatChartValue?: (value: number) => string;
	title?: string;
	chartType?: ChartSeriesKind;
	chartStepType?: ChartCurveType;
	partialLastSegment?: boolean;
}) {
	if (!data.some((d) => d.value !== data[0].value)) {
		return (
			<div className="flex h-24 items-center pt-2">
				<div className="h-px w-full bg-chart-1 opacity-30" />
			</div>
		);
	}

	return (
		<Chart.SingleSeries
			curveType={chartStepType}
			data={data}
			fallbackClassName="h-[102px] w-full"
			height={MINI_CHART_HEIGHT}
			id={id}
			partialLastSegment={partialLastSegment}
			seriesKind={chartType}
			tooltip={{ formatValue: formatChartValue, valueSuffixLabel: title }}
		/>
	);
}

const DURATION_REGEX = /\d+(\.\d+)?(s|ms)$/;

export function StatCard({
	title,
	titleExtra,
	value,
	description,
	icon: Icon,
	trend,
	isLoading = false,
	className,
	invertTrend = false,
	id,
	chartData,
	showChart = false,
	chartType = "area",
	chartStepType = "monotone",
	formatValue,
	formatChartValue,
	displayMode,
	partialLastSegment = true,
}: StatCardProps) {
	const trendValue =
		typeof trend === "object" && trend !== null ? trend.change : trend;

	const resolvedDisplayMode: StatCardDisplayMode =
		displayMode ?? (showChart ? "chart" : "compact");
	const hasValidChartData =
		resolvedDisplayMode === "chart" && chartData && chartData.length > 0;

	if (isLoading) {
		return (
			<Chart className={cn("gap-0 overflow-hidden py-0", className)} id={id}>
				{resolvedDisplayMode === "text" && (
					<Chart.Plot className="flex h-26 items-center justify-center">
						<Skeleton className="h-10 w-28 rounded" />
					</Chart.Plot>
				)}
				{resolvedDisplayMode === "chart" && (
					<Chart.Plot className="pt-2">
						<Skeleton className="h-[102px] w-full rounded" />
					</Chart.Plot>
				)}
				<Chart.Footer className="border-t-0">
					{Icon && (
						<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
							<Skeleton className="size-4 rounded" />
						</div>
					)}
					<div className="min-w-0 flex-1">
						<Skeleton className="h-5 w-28 rounded" />
						<Skeleton className="h-4 w-24 rounded" />
					</div>
					{resolvedDisplayMode !== "text" && (
						<div className="flex shrink-0 items-center gap-1">
							<Skeleton className="size-4 rounded" />
							<Skeleton className="h-3.5 w-9 rounded" />
						</div>
					)}
				</Chart.Footer>
			</Chart>
		);
	}

	const isTimeValue = typeof value === "string" && DURATION_REGEX.test(value);
	const displayValue =
		(typeof value === "string" && (value.endsWith("%") || isTimeValue)) ||
		typeof value !== "number"
			? value.toString()
			: formatNumber(value);

	const cardContent = (
		<Chart
			className={cn(
				"group gap-0 overflow-visible py-0 hover:border-primary",
				className
			)}
			id={id}
		>
			{hasValidChartData && (
				<Chart.Plot className="pt-2">
					<MiniChart
						chartStepType={chartStepType}
						chartType={chartType}
						data={chartData}
						formatChartValue={formatChartValue}
						id={id || `chart-${title.toLowerCase().replace(/\s/g, "-")}`}
						partialLastSegment={partialLastSegment}
						title={title}
					/>
				</Chart.Plot>
			)}
			{resolvedDisplayMode === "text" && (
				<Chart.Plot className="flex h-26 items-center justify-center">
					<span className="font-bold text-4xl text-foreground tabular-nums">
						{displayValue}
					</span>
				</Chart.Plot>
			)}
			<Chart.Footer className="border-t-0">
				{Icon && (
					<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
						<Icon className="size-4 text-muted-foreground" weight="duotone" />
					</div>
				)}
				<div className="min-w-0 flex-1">
					{resolvedDisplayMode === "text" ? (
						<>
							<p className="truncate font-medium text-foreground text-sm">
								{title}
							</p>
							{description && (
								<p className="truncate text-muted-foreground text-xs">
									{description}
								</p>
							)}
						</>
					) : (
						<>
							<p className="truncate font-semibold text-base tabular-nums leading-tight">
								{displayValue}
							</p>
							<p className="truncate text-muted-foreground text-xs">{title}</p>
						</>
					)}
				</div>
				{titleExtra}
				<div className="shrink-0 text-right">
					{resolvedDisplayMode !== "text" &&
					trendValue !== undefined &&
					!Number.isNaN(trendValue) ? (
						<TrendIndicator invertColor={invertTrend} value={trendValue} />
					) : resolvedDisplayMode !== "text" && description ? (
						<span className="text-muted-foreground text-xs">{description}</span>
					) : null}
				</div>
			</Chart.Footer>
		</Chart>
	);

	if (
		typeof trend === "object" &&
		trend !== null &&
		trend.currentPeriod &&
		trend.previousPeriod
	) {
		return (
			<HoverCard>
				<HoverCardTrigger asChild>{cardContent}</HoverCardTrigger>
				<HoverCardContent className="w-64 p-0" sideOffset={8}>
					<div className="flex items-center gap-2.5 border-b bg-accent px-3 py-2.5">
						{Icon && (
							<div className="flex size-7 items-center justify-center rounded bg-background">
								<Icon className="size-4 text-muted-foreground" />
							</div>
						)}
						<span className="font-semibold text-foreground text-sm">
							{title}
						</span>
					</div>

					<div className="grid grid-cols-2 divide-x">
						<div className="p-3">
							<p className="font-medium text-muted-foreground text-xs">
								Previous
							</p>
							<p className="mt-1 font-semibold text-foreground text-lg tabular-nums">
								{formatTrendValue(trend.previous, formatValue)}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{dayjs(trend.previousPeriod.start).format("MMM D")} –{" "}
								{dayjs(trend.previousPeriod.end).format("MMM D")}
							</p>
						</div>
						<div className="p-3">
							<p className="font-medium text-muted-foreground text-xs">
								Current
							</p>
							<p className="mt-1 font-semibold text-foreground text-lg tabular-nums">
								{formatTrendValue(trend.current, formatValue)}
							</p>
							<p className="mt-0.5 text-muted-foreground text-xs">
								{dayjs(trend.currentPeriod.start).format("MMM D")} –{" "}
								{dayjs(trend.currentPeriod.end).format("MMM D")}
							</p>
						</div>
					</div>

					<div className="flex items-center justify-between border-t bg-accent px-3 py-2">
						<span className="text-muted-foreground text-xs">Change</span>
						<TrendIndicator
							className="text-sm"
							invertColor={invertTrend}
							value={trend.change || 0}
						/>
					</div>
				</HoverCardContent>
			</HoverCard>
		);
	}

	return cardContent;
}
