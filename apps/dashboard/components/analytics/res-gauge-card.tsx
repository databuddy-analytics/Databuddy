"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { TrendDownIcon } from "@phosphor-icons/react";
import { TrendUpIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import { memo, useMemo } from "react";
import { GaugeChart, type GaugeRating } from "@/components/charts/gauge-chart";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	calculateRES,
	calculateRESTrend,
	type MetricScoreData,
} from "@/lib/vitals-scoring";

interface MetricInput {
	metric_name: string;
	p75: number;
	samples?: number;
}

interface PercentileOption {
	description: string;
	label: string;
	value: string;
}

interface RESGaugeCardProps {
	/** Additional class names */
	className?: string;
	/** Loading state */
	isLoading?: boolean;
	/** Current period metrics with p75 values */
	metrics: MetricInput[];
	/** Callback when percentile changes */
	onPercentileChangeAction?: (value: string) => void;
	/** Percentile options for the selector */
	percentileOptions?: PercentileOption[];
	/** Previous period metrics for trend comparison */
	previousMetrics?: MetricInput[];
	/** Currently selected percentile */
	selectedPercentile?: string;
}

const STATUS_CONFIG = {
	good: {
		label: "Good",
		description: "Your site passes Core Web Vitals",
		colorClass: "text-success",
		bgClass: "bg-success/10",
		borderClass: "border-l-success",
	},
	"needs-improvement": {
		label: "Needs Work",
		description: "Some metrics need improvement",
		colorClass: "text-warning",
		bgClass: "bg-warning/10",
		borderClass: "border-l-warning",
	},
	poor: {
		label: "Poor",
		description: "Critical performance issues detected",
		colorClass: "text-destructive",
		bgClass: "bg-destructive/10",
		borderClass: "border-l-destructive",
	},
} as const;

const METRIC_LABELS: Record<string, { name: string; unit: string }> = {
	FCP: { name: "First Contentful Paint", unit: "ms" },
	LCP: { name: "Largest Contentful Paint", unit: "ms" },
	INP: { name: "Interaction to Next Paint", unit: "ms" },
	CLS: { name: "Cumulative Layout Shift", unit: "" },
};

function MetricBreakdownItem({ data }: { data: MetricScoreData }) {
	const label = METRIC_LABELS[data.metric];
	const weightPercent = Math.round(data.weight * 100);

	const formatValue = (value: number | null) => {
		if (value === null) {
			return "—";
		}
		if (data.metric === "CLS") {
			return value.toFixed(2);
		}
		return `${Math.round(value)}${label?.unit || ""}`;
	};

	const statusColor =
		data.status === "good"
			? "text-success"
			: data.status === "needs-improvement"
				? "text-warning"
				: data.status === "poor"
					? "text-destructive"
					: "text-muted-foreground";

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className="flex items-center justify-between gap-2 rounded px-1.5 py-1 transition-colors hover:bg-accent">
					<div className="flex items-center gap-1.5">
						<span className="font-medium text-foreground text-xs">
							{data.metric}
						</span>
						<span className="text-muted-foreground text-xs">
							({weightPercent}%)
						</span>
					</div>
					<div className="flex items-center gap-2">
						<span
							className={cn("font-medium text-xs tabular-nums", statusColor)}
						>
							{formatValue(data.rawValue)}
						</span>
						{data.score !== null && (
							<span className="text-muted-foreground text-xs tabular-nums">
								{data.score}
							</span>
						)}
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent side="left">
				<p className="font-medium text-sm">{label?.name || data.metric}</p>
				<p className="text-muted-foreground text-xs">
					Score: {data.score ?? "N/A"} · Weight: {weightPercent}%
				</p>
			</TooltipContent>
		</Tooltip>
	);
}

function RESGaugeCardSkeleton({ className }: { className?: string }) {
	return (
		<Card className={cn("gap-0 border-l-4 py-0", className)}>
			<CardContent className="flex items-center gap-4 p-4">
				<Skeleton className="size-24 shrink-0 rounded-full" />
				<div className="flex-1 space-y-2">
					<Skeleton className="h-5 w-40" />
					<Skeleton className="h-4 w-32" />
					<div className="mt-3 space-y-1">
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-full" />
						<Skeleton className="h-3 w-full" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export const RESGaugeCard = memo(function RESGaugeCard({
	metrics,
	previousMetrics,
	isLoading = false,
	className,
	percentileOptions,
	selectedPercentile,
	onPercentileChangeAction,
}: RESGaugeCardProps) {
	const res = useMemo(() => calculateRES(metrics), [metrics]);

	const trend = useMemo(() => {
		if (!previousMetrics || previousMetrics.length === 0) {
			return null;
		}
		return calculateRESTrend(metrics, previousMetrics);
	}, [metrics, previousMetrics]);

	if (isLoading) {
		return <RESGaugeCardSkeleton className={className} />;
	}

	if (metrics.length === 0 || res.score === null) {
		return null;
	}

	const statusConfig = res.status ? STATUS_CONFIG[res.status] : null;
	const rating: GaugeRating = res.status || "poor";

	const hasTrend = trend?.change !== null && trend?.change !== undefined;
	const trendIsPositive = hasTrend && (trend?.change ?? 0) > 0;
	const trendIsNegative = hasTrend && (trend?.change ?? 0) < 0;

	return (
		<Card
			className={cn(
				"gap-0 border-l-4 py-0",
				statusConfig?.borderClass,
				className
			)}
		>
			<CardContent className="flex items-stretch gap-4 p-4">
				<div className="flex shrink-0 flex-col items-center justify-center">
					<GaugeChart
						formatValue={(v) => String(Math.round(v))}
						max={100}
						rating={rating}
						size={96}
						value={res.score}
					/>
					{hasTrend && Math.abs(trend?.change ?? 0) >= 1 && (
						<div
							className={cn(
								"mt-1 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium text-xs",
								trendIsPositive && "bg-success/10 text-success",
								trendIsNegative && "bg-destructive/10 text-destructive",
								!(trendIsPositive || trendIsNegative) &&
									"bg-muted text-muted-foreground"
							)}
						>
							{trendIsPositive && (
								<TrendUpIcon className="size-3" weight="bold" />
							)}
							{trendIsNegative && (
								<TrendDownIcon className="size-3" weight="bold" />
							)}
							<span>{Math.abs(Math.round(trend?.change ?? 0))} pts</span>
						</div>
					)}
				</div>

				<div className="flex flex-1 flex-col justify-center">
					<div className="flex items-center gap-2">
						{statusConfig && (
							<div
								className={cn(
									"flex size-6 items-center justify-center rounded-full",
									statusConfig.bgClass
								)}
							>
								{res.status === "good" && (
									<CheckCircleIcon
										className="size-4 text-success"
										weight="duotone"
									/>
								)}
								{res.status === "needs-improvement" && (
									<WarningCircleIcon
										className="size-4 text-warning"
										weight="duotone"
									/>
								)}
								{res.status === "poor" && (
									<WarningIcon
										className="size-4 text-destructive"
										weight="duotone"
									/>
								)}
							</div>
						)}
						<div>
							<div className="flex items-baseline gap-1.5">
								<span className="font-bold text-lg">Real Experience Score</span>
								<span
									className={cn(
										"font-semibold text-sm",
										statusConfig?.colorClass
									)}
								>
									{statusConfig?.label}
								</span>
							</div>
							<p className="text-muted-foreground text-xs">
								Based on P75 values ·{" "}
								{res.totalSamples > 0
									? `${res.totalSamples.toLocaleString()} samples`
									: "No samples"}
							</p>
						</div>
					</div>

					<div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-0.5">
						{res.metrics.map((metric) => (
							<MetricBreakdownItem data={metric} key={metric.metric} />
						))}
					</div>
				</div>

				{percentileOptions && onPercentileChangeAction && (
					<div className="flex shrink-0 flex-col justify-center gap-1.5 border-l pl-4">
						<span className="text-muted-foreground text-xs">Percentile</span>
						<div className="flex flex-col gap-0.5">
							{percentileOptions.map((opt) => (
								<button
									className={cn(
										"rounded px-2.5 py-1 text-left font-medium text-xs transition-colors",
										selectedPercentile === opt.value
											? "bg-primary text-primary-foreground"
											: "text-muted-foreground hover:bg-accent hover:text-foreground"
									)}
									key={opt.value}
									onClick={() => onPercentileChangeAction(opt.value)}
									type="button"
								>
									{opt.label}
								</button>
							))}
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
});

export type { RESGaugeCardProps };
