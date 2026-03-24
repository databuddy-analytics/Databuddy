"use client";

import { InfoIcon, TrendDownIcon, TrendUpIcon } from "@phosphor-icons/react";
import { GaugeChart, type GaugeRating } from "@/components/charts/gauge-chart";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface VitalConfig {
	name: string;
	label: string;
	description: string;
	/** Detailed explanation for users who don't know what this metric means */
	explanation: string;
	/** What users should do to improve this metric */
	improvementTips: string[];
	unit: string;
	goodThreshold: number;
	poorThreshold: number;
	/** If true, lower is better (most metrics). If false, higher is better (FPS) */
	lowerIsBetter?: boolean;
	/** Max value for the gauge (determines 100% fill) */
	maxValue: number;
	/** Color for the chart line */
	color: string;
}

export const VITAL_CONFIGS: Record<string, VitalConfig> = {
	LCP: {
		name: "LCP",
		label: "Largest Contentful Paint",
		description: "Loading performance",
		explanation:
			"Measures how long it takes for the largest visible content (image or text block) to appear. Users perceive this as the page being 'ready'. A slow LCP makes your site feel sluggish.",
		improvementTips: [
			"Optimize and compress images",
			"Use modern image formats (WebP, AVIF)",
			"Preload critical resources",
			"Use a CDN for static assets",
		],
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
		explanation:
			"Measures when the first content appears on screen. This is the user's first visual feedback that the page is loading. A fast FCP gives users confidence your site is working.",
		improvementTips: [
			"Reduce server response time",
			"Eliminate render-blocking resources",
			"Inline critical CSS",
			"Preconnect to required origins",
		],
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
		explanation:
			"Measures unexpected layout shifts during the page's lifetime. High CLS means content 'jumps around' as the page loads—frustrating users who may click the wrong thing or lose their place.",
		improvementTips: [
			"Set explicit width/height on images and videos",
			"Reserve space for ads and embeds",
			"Avoid inserting content above existing content",
			"Use CSS transform for animations",
		],
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
		explanation:
			"Measures how quickly your page responds to user interactions (clicks, taps, key presses). A slow INP makes your site feel unresponsive and laggy, causing users to abandon actions.",
		improvementTips: [
			"Break up long JavaScript tasks",
			"Optimize event handlers",
			"Use web workers for heavy computation",
			"Reduce DOM size",
		],
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
		explanation:
			"Measures how long it takes for the server to respond with the first byte of data. A slow TTFB indicates server-side issues—everything else waits for the server.",
		improvementTips: [
			"Optimize server-side code",
			"Use a CDN closer to users",
			"Implement caching strategies",
			"Upgrade server resources",
		],
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
		explanation:
			"Measures animation smoothness. Higher is better—60 FPS means smooth scrolling and animations. Low FPS causes visible stuttering and makes your site feel janky.",
		improvementTips: [
			"Avoid layout thrashing",
			"Use CSS transforms instead of top/left",
			"Debounce scroll/resize handlers",
			"Reduce paint complexity",
		],
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
		if (value <= config.goodThreshold) {
			return "good";
		}
		if (value <= config.poorThreshold) {
			return "needs-improvement";
		}
		return "poor";
	}
	// Higher is better (FPS)
	if (value >= config.goodThreshold) {
		return "good";
	}
	if (value >= config.poorThreshold) {
		return "needs-improvement";
	}
	return "poor";
}

const RATING_LABELS: Record<GaugeRating, { label: string; className: string }> =
	{
		good: { label: "Good", className: "text-success" },
		"needs-improvement": { label: "Needs work", className: "text-warning" },
		poor: { label: "Poor", className: "text-destructive" },
	};

interface TrendData {
	previousValue: number | null;
	change: number | null;
}

interface VitalGaugeCardProps {
	metricName: keyof typeof VITAL_CONFIGS;
	value: number | null;
	samples?: number;
	isLoading?: boolean;
	className?: string;
	/** Whether this metric is selected/active for the chart */
	isActive?: boolean;
	/** Callback when the card is clicked to toggle */
	onToggleAction?: () => void;
	/** Trend data comparing to previous period */
	trend?: TrendData;
}

export function VitalGaugeCard({
	metricName,
	value,
	samples,
	isLoading = false,
	className,
	isActive = true,
	onToggleAction,
	trend,
}: VitalGaugeCardProps) {
	const config = VITAL_CONFIGS[metricName];

	if (!config) {
		return null;
	}

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
		if (config.name === "CLS") {
			return v.toFixed(2);
		}
		return Math.round(v).toLocaleString();
	};

	// Calculate trend direction and whether it's positive
	// For most metrics, lower is better (negative change = improvement)
	// For FPS, higher is better (positive change = improvement)
	const trendChange = trend?.change ?? null;
	const hasTrend = trendChange !== null && hasValue;

	let trendIsPositive = false;
	let trendIsNegative = false;

	if (hasTrend && trendChange !== null) {
		if (config.lowerIsBetter === false) {
			trendIsPositive = trendChange > 0;
			trendIsNegative = trendChange < 0;
		} else {
			trendIsPositive = trendChange < 0;
			trendIsNegative = trendChange > 0;
		}
	}

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
			<div className="dotted-bg relative flex items-center justify-center bg-accent py-3">
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

				<div className="absolute top-2 right-2">
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								aria-label={`Learn more about ${config.label}`}
								className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-background/50 hover:text-foreground"
								onClick={(e) => e.stopPropagation()}
								type="button"
							>
								<InfoIcon className="size-3.5" weight="duotone" />
							</button>
						</TooltipTrigger>
						<TooltipContent className="max-w-xs p-0" side="top">
							<div className="border-b bg-accent px-3 py-2">
								<p className="font-semibold text-foreground text-sm">
									{config.label}
								</p>
								<p className="mt-0.5 text-muted-foreground text-xs">
									{config.explanation}
								</p>
							</div>
							{rating === "poor" && config.improvementTips.length > 0 && (
								<div className="border-b px-3 py-2">
									<p className="mb-1 font-medium text-warning text-xs">
										How to improve:
									</p>
									<ul className="space-y-0.5">
										{config.improvementTips.slice(0, 3).map((tip) => (
											<li className="text-muted-foreground text-xs" key={tip}>
												• {tip}
											</li>
										))}
									</ul>
								</div>
							)}
							<div className="flex justify-between bg-accent px-3 py-1.5">
								<span className="text-muted-foreground text-xs">
									Good: {config.lowerIsBetter === false ? "≥" : "≤"}{" "}
									{config.name === "CLS"
										? config.goodThreshold
										: `${config.goodThreshold}${config.unit}`}
								</span>
								<span className="text-muted-foreground text-xs">
									Poor: {config.lowerIsBetter === false ? "<" : ">"}{" "}
									{config.name === "CLS"
										? config.poorThreshold
										: `${config.poorThreshold}${config.unit}`}
								</span>
							</div>
						</TooltipContent>
					</Tooltip>
				</div>

				{hasTrend && trendChange !== null && Math.abs(trendChange) >= 1 && (
					<div
						className={cn(
							"absolute bottom-2 left-2 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium text-xs",
							trendIsPositive && "bg-success/10 text-success",
							trendIsNegative && "bg-destructive/10 text-destructive",
							!(trendIsPositive || trendIsNegative) &&
								"bg-muted text-muted-foreground"
						)}
					>
						{trendIsPositive && (
							<TrendDownIcon className="size-3" weight="bold" />
						)}
						{trendIsNegative && (
							<TrendUpIcon className="size-3" weight="bold" />
						)}
						<span>{Math.abs(Math.round(trendChange))}%</span>
					</div>
				)}
			</div>

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
					) : samples === undefined ? null : (
						<span className="text-muted-foreground text-xs">
							{samples.toLocaleString()}
						</span>
					)}
				</div>
			</div>
		</Card>
	);
}

export type { TrendData, VitalConfig, VitalGaugeCardProps };
