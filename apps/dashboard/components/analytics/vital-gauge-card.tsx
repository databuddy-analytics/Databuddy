"use client";

import { GaugeChart, type GaugeRating } from "@/components/charts/gauge-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type VitalConfig = {
	name: string;
	label: string;
	description: string;
	unit: string;
	goodThreshold: number;
	poorThreshold: number;
	/** If true, lower is better (most metrics). If false, higher is better (FPS) */
	lowerIsBetter?: boolean;
	/** Max value for the gauge (determines 100% fill) */
	maxValue: number;
	/** Color for the chart line */
	color: string;
};

export const VITAL_CONFIGS: Record<string, VitalConfig> = {
	LCP: {
		name: "LCP",
		label: "Largest Contentful Paint",
		description: "Loading performance",
		unit: "ms",
		goodThreshold: 2500,
		poorThreshold: 4000,
		lowerIsBetter: true,
		maxValue: 6000,
		color: "#3b82f6",
	},
	FCP: {
		name: "FCP",
		label: "First Contentful Paint",
		description: "Initial render",
		unit: "ms",
		goodThreshold: 1800,
		poorThreshold: 3000,
		lowerIsBetter: true,
		maxValue: 4500,
		color: "#10b981",
	},
	CLS: {
		name: "CLS",
		label: "Cumulative Layout Shift",
		description: "Visual stability",
		unit: "",
		goodThreshold: 0.1,
		poorThreshold: 0.25,
		lowerIsBetter: true,
		maxValue: 0.5,
		color: "#ec4899",
	},
	INP: {
		name: "INP",
		label: "Interaction to Next Paint",
		description: "Responsiveness",
		unit: "ms",
		goodThreshold: 200,
		poorThreshold: 500,
		lowerIsBetter: true,
		maxValue: 750,
		color: "#8b5cf6",
	},
	TTFB: {
		name: "TTFB",
		label: "Time to First Byte",
		description: "Server speed",
		unit: "ms",
		goodThreshold: 800,
		poorThreshold: 1800,
		lowerIsBetter: true,
		maxValue: 2700,
		color: "#f59e0b",
	},
	FPS: {
		name: "FPS",
		label: "Frames Per Second",
		description: "Smoothness",
		unit: "fps",
		goodThreshold: 55,
		poorThreshold: 30,
		lowerIsBetter: false,
		maxValue: 60,
		color: "#ef4444",
	},
};

function getRating(value: number, config: VitalConfig): GaugeRating {
	if (config.lowerIsBetter !== false) {
		if (value <= config.goodThreshold) return "good";
		if (value <= config.poorThreshold) return "needs-improvement";
		return "poor";
	}
	// Higher is better (FPS)
	if (value >= config.goodThreshold) return "good";
	if (value >= config.poorThreshold) return "needs-improvement";
	return "poor";
}

const RATING_LABELS: Record<GaugeRating, { label: string; className: string }> =
	{
		good: { label: "Good", className: "text-emerald-500" },
		"needs-improvement": { label: "Needs work", className: "text-amber-500" },
		poor: { label: "Poor", className: "text-red-500" },
	};

type VitalGaugeCardProps = {
	metricName: keyof typeof VITAL_CONFIGS;
	value: number | null;
	samples?: number;
	isLoading?: boolean;
	className?: string;
	/** Whether this metric is selected/active for the chart */
	isActive?: boolean;
	/** Callback when the card is clicked to toggle */
	onToggleAction?: () => void;
};

export function VitalGaugeCard({
	metricName,
	value,
	samples,
	isLoading = false,
	className,
	isActive = true,
	onToggleAction,
}: VitalGaugeCardProps) {
	const config = VITAL_CONFIGS[metricName];

	if (!config) return null;

	const isClickable = Boolean(onToggleAction);

	if (isLoading) {
		return (
			<Card
				className={cn("gap-0 overflow-hidden border bg-card py-0", className)}
			>
				<div className="dotted-bg flex items-center justify-center bg-accent py-3">
					<Skeleton className="size-24 rounded-full" />
				</div>
				<div className="flex items-center gap-2 border-t px-2.5 py-2">
					<div className="min-w-0 flex-1 space-y-1">
						<Skeleton className="h-4 w-12" />
						<Skeleton className="h-3 w-16" />
					</div>
					<Skeleton className="h-4 w-14 shrink-0" />
				</div>
			</Card>
		);
	}

	const hasValue = value !== null && !Number.isNaN(value);
	const rating = hasValue ? getRating(value, config) : null;
	const ratingInfo = rating ? RATING_LABELS[rating] : null;

	const formatValue = (v: number) => {
		if (config.name === "CLS") return v.toFixed(2);
		return Math.round(v).toLocaleString();
	};

	return (
		<Card
			className={cn(
				"gap-0 overflow-hidden border bg-card py-0 transition-all",
				isClickable && "cursor-pointer hover:border-primary",
				isActive && isClickable && "ring-2 ring-primary/20",
				!isActive && "opacity-50 grayscale",
				className
			)}
			onClick={onToggleAction}
			onKeyDown={
				isClickable
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onToggleAction?.();
							}
						}
					: undefined
			}
			role={isClickable ? "button" : undefined}
			tabIndex={isClickable ? 0 : undefined}
		>
			{/* Gauge Chart Area */}
			<div className="dotted-bg flex items-center justify-center bg-accent py-3">
				{hasValue && rating ? (
					<GaugeChart
						formatValue={formatValue}
						max={config.maxValue}
						rating={rating}
						size={96}
						unit={config.unit}
						value={value}
					/>
				) : (
					<div className="flex size-24 items-center justify-center rounded-full border-4 border-muted bg-background">
						<span className="text-muted-foreground text-sm">—</span>
					</div>
				)}
			</div>

			{/* Footer - Matches stat-card */}
			<div className="flex items-center gap-2 border-t px-2.5 py-2">
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-sm leading-tight">
						{config.name}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						{config.description}
					</p>
				</div>
				<div className="shrink-0 text-right">
					{ratingInfo ? (
						<span className={cn("font-semibold text-xs", ratingInfo.className)}>
							{ratingInfo.label}
						</span>
					) : samples !== undefined ? (
						<span className="text-muted-foreground text-xs">
							{samples.toLocaleString()}
						</span>
					) : null}
				</div>
			</div>
		</Card>
	);
}

export type { VitalConfig, VitalGaugeCardProps };
