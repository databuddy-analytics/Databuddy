"use client";

import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	BugIcon,
	CaretDownIcon,
	CheckCircleIcon,
	GaugeIcon,
	LightningIcon,
	RocketIcon,
	SparkleIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { generateId } from "ai";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
	Insight,
	InsightSentiment,
	InsightType,
} from "../hooks/use-smart-insights";

function buildDiagnosticPrompt(insight: Insight): string {
	const parts = [
		`Diagnose this issue on ${insight.websiteName ?? insight.websiteDomain}:`,
		`"${insight.title}"`,
		"",
		`Context: ${insight.description}`,
	];

	if (insight.changePercent !== undefined && insight.changePercent > 0) {
		parts.push(
			`Change: ${insight.sentiment === "negative" ? "-" : "+"}${insight.changePercent}%`
		);
	}

	parts.push(
		"",
		"Investigate the root cause, check the relevant data for the last 7 days, and provide a clear explanation of what's happening and specific steps to fix or improve it."
	);

	return parts.join("\n");
}

const ICON_STYLES: Record<
	InsightType,
	{ icon: ReactNode; color: string; bg: string }
> = {
	error_spike: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	vitals_degraded: {
		icon: <GaugeIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	custom_event_spike: {
		icon: <LightningIcon className="size-4" weight="fill" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	traffic_drop: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	traffic_spike: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	performance: {
		icon: <RocketIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	uptime_issue: {
		icon: <WarningCircleIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
};

const DEFAULT_ICON = {
	icon: <SparkleIcon className="size-4" weight="duotone" />,
	color: "text-primary",
	bg: "bg-primary/10",
};

const SENTIMENT_STYLE: Record<
	InsightSentiment,
	{ text: string; color: string }
> = {
	positive: { text: "Positive", color: "text-emerald-600" },
	neutral: { text: "Neutral", color: "text-muted-foreground" },
	negative: { text: "Needs attention", color: "text-red-500" },
};

function InsightRow({ insight }: { insight: Insight }) {
	const [expanded, setExpanded] = useState(false);
	const style = ICON_STYLES[insight.type] ?? DEFAULT_ICON;
	const sentiment =
		SENTIMENT_STYLE[insight.sentiment] ?? SENTIMENT_STYLE.neutral;

	const agentHref = useMemo(() => {
		const chatId = generateId();
		const prompt = encodeURIComponent(buildDiagnosticPrompt(insight));
		return `/websites/${insight.websiteId}/agent/${chatId}?prompt=${prompt}`;
	}, [insight]);

	return (
		<button
			className={cn(
				"flex w-full cursor-pointer flex-col text-left transition-colors hover:bg-accent/40",
				expanded && "bg-accent/20"
			)}
			onClick={() => setExpanded((prev) => !prev)}
			type="button"
		>
			<div className="flex w-full items-start gap-3 px-4 py-3">
				<div
					className={cn(
						"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
						style.bg,
						style.color
					)}
				>
					{style.icon}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate font-medium text-foreground text-sm">
							{insight.title}
						</p>
						<div className="flex shrink-0 items-center gap-1.5">
							<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
								{insight.priority}/10
							</span>
							<CaretDownIcon
								className={cn(
									"size-3 text-muted-foreground transition-transform",
									expanded && "rotate-180"
								)}
								weight="fill"
							/>
						</div>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-xs">
						<span className="truncate text-muted-foreground">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">·</span>
						<span className={sentiment.color}>{sentiment.text}</span>
						{insight.changePercent !== undefined &&
							insight.changePercent > 0 && (
								<>
									<span className="text-muted-foreground/30">·</span>
									<span
										className={cn(
											"tabular-nums",
											insight.sentiment === "negative"
												? "text-red-500"
												: "text-emerald-600"
										)}
									>
										{insight.sentiment === "negative" ? "-" : "+"}
										{insight.changePercent}%
									</span>
								</>
							)}
					</div>
					{!expanded && (
						<p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
							{insight.description}
						</p>
					)}
				</div>
			</div>

			{expanded && (
				<div className="space-y-2 px-4 pb-3 pl-14">
					<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
						{insight.description}
					</p>
					<div className="flex items-start gap-2 rounded bg-accent/60 px-2.5 py-2">
						<SparkleIcon
							className="mt-px size-3 shrink-0 text-primary"
							weight="duotone"
						/>
						<p className="text-pretty text-foreground text-xs leading-relaxed">
							{insight.suggestion}
						</p>
					</div>
					<Link
						className="mt-1 inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
						href={agentHref}
						onClick={(e) => e.stopPropagation()}
					>
						Investigate with Databunny
						<ArrowRightIcon className="size-3" weight="fill" />
					</Link>
				</div>
			)}
		</button>
	);
}

function InsightSkeleton({ wide }: { wide?: boolean }) {
	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<Skeleton className="mt-0.5 size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 space-y-1">
						<Skeleton className={cn("h-4 rounded", wide ? "w-44" : "w-32")} />
						<Skeleton className="h-3 w-24 rounded" />
					</div>
					<Skeleton className="h-4 w-8 rounded" />
				</div>
				<Skeleton className={cn("h-3 rounded", wide ? "w-56" : "w-40")} />
			</div>
		</div>
	);
}

function AnalyzingState() {
	return (
		<div className="space-y-0 divide-y">
			<div className="flex items-center gap-3 px-4 py-4">
				<div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10">
					<SparkleIcon
						className="size-4 animate-pulse text-primary"
						weight="duotone"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-medium text-foreground text-sm">
						Analyzing your websites…
					</p>
					<p className="text-muted-foreground text-xs">
						Databunny is checking traffic, errors, and performance
					</p>
				</div>
			</div>
			<InsightSkeleton />
			<InsightSkeleton wide />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex items-center gap-3 px-4 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
				<CheckCircleIcon className="size-5 text-emerald-500" weight="fill" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					All systems healthy
				</p>
				<p className="text-muted-foreground text-xs">
					No actionable insights detected across your websites
				</p>
			</div>
		</div>
	);
}

function ErrorState({ onRetryAction }: { onRetryAction?: () => void }) {
	return (
		<div className="flex items-center gap-3 px-4 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
				<WarningCircleIcon className="size-5 text-red-500" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					Couldn't load insights
				</p>
				<p className="text-muted-foreground text-xs">
					AI analysis timed out or failed
				</p>
			</div>
			{onRetryAction && (
				<button
					className="shrink-0 rounded bg-accent px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent/80"
					onClick={onRetryAction}
					type="button"
				>
					Retry
				</button>
			)}
		</div>
	);
}

interface InsightsSectionProps {
	insights: Insight[];
	isLoading?: boolean;
	isFetching?: boolean;
	isError?: boolean;
	onRefreshAction?: () => void;
}

export function SmartInsightsSection({
	insights,
	isLoading,
	isFetching,
	isError,
	onRefreshAction,
}: InsightsSectionProps) {
	if (isLoading) {
		return (
			<div className="rounded border bg-card">
				<div className="flex items-center gap-2 border-b px-4 py-3">
					<SparkleIcon className="size-4 text-primary" weight="duotone" />
					<h3 className="font-semibold text-foreground text-sm">
						Actionable Insights
					</h3>
				</div>
				<AnalyzingState />
			</div>
		);
	}

	const showInsights = !isError && insights.length > 0;
	const showEmpty = !isError && insights.length === 0;

	return (
		<div className="rounded border bg-card">
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<SparkleIcon className="size-4 text-primary" weight="duotone" />
					<h3 className="font-semibold text-foreground text-sm">
						Actionable Insights
					</h3>
				</div>
				<div className="flex items-center gap-2">
					{showInsights && (
						<span className="text-muted-foreground text-xs">
							{insights.length} {insights.length === 1 ? "insight" : "insights"}
						</span>
					)}
					{onRefreshAction && (
						<button
							aria-label="Refresh insights"
							className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
							disabled={isFetching}
							onClick={onRefreshAction}
							type="button"
						>
							<ArrowClockwiseIcon
								className={cn("size-3.5", isFetching && "animate-spin")}
							/>
						</button>
					)}
				</div>
			</div>
			{isError && <ErrorState onRetryAction={onRefreshAction} />}
			{showEmpty && <EmptyState />}
			{showInsights && (
				<div className="max-h-[280px] divide-y overflow-y-auto">
					{insights.map((insight) => (
						<InsightRow insight={insight} key={insight.id} />
					))}
				</div>
			)}
		</div>
	);
}
