"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { LightbulbIcon } from "@phosphor-icons/react/dist/ssr/Lightbulb";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import { useState } from "react";
import { InsightCard } from "@/app/(main)/insights/_components/insight-card";
import { Card } from "@/components/ds/card";
import { Skeleton } from "@/components/ds/skeleton";
import type { Insight } from "@/lib/insight-types";
import { cn } from "@/lib/utils";

function InsightRowWrapper({ insight }: { insight: Insight }) {
	const [expanded, setExpanded] = useState(false);
	return (
		<InsightCard
			expanded={expanded}
			insight={insight}
			onToggleAction={() => setExpanded((prev) => !prev)}
			variant="compact"
		/>
	);
}

function InsightSkeleton({ wide }: { wide?: boolean }) {
	return (
		<div className="flex items-start gap-3 px-5 py-3">
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
		<div className="divide-y">
			<div className="flex items-center gap-3 px-5 py-4">
				<div className="flex size-7 shrink-0 items-center justify-center rounded bg-primary/10">
					<LightbulbIcon
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

function InsightsEmptyState() {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
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

function InsightsErrorState({ onRetryAction }: { onRetryAction?: () => void }) {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
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
					className="shrink-0 rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:bg-accent/80"
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
	isError?: boolean;
	isFetching?: boolean;
	isFetchingFresh?: boolean;
	isLoading?: boolean;
	onRefreshAction?: () => void;
	variant?: "compact" | "full";
}

export function SmartInsightsSection({
	insights,
	isLoading,
	isFetching,
	isFetchingFresh,
	isError,
	onRefreshAction,
	variant = "compact",
}: InsightsSectionProps) {
	if (isLoading) {
		return (
			<Card className={variant === "full" ? "min-h-0 flex-1" : ""}>
				<Card.Header className="flex-row items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<LightbulbIcon className="size-4 text-primary" weight="duotone" />
						<Card.Title className="text-sm">Actionable Insights</Card.Title>
					</div>
				</Card.Header>
				<AnalyzingState />
			</Card>
		);
	}

	if (isError) {
		return (
			<Card className={variant === "full" ? "min-h-0 flex-1" : ""}>
				<Card.Header className="flex-row items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<LightbulbIcon className="size-4 text-primary" weight="duotone" />
						<Card.Title className="text-sm">Actionable Insights</Card.Title>
					</div>
				</Card.Header>
				<InsightsErrorState onRetryAction={onRefreshAction} />
			</Card>
		);
	}

	const showInsights = insights.length > 0;
	const showEmpty = insights.length === 0;

	return (
		<Card className={variant === "full" ? "min-h-0 flex-1" : ""}>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<LightbulbIcon
							className="size-4 shrink-0 text-primary"
							weight="duotone"
						/>
						<Card.Title className="text-sm">Actionable Insights</Card.Title>
					</div>
					{isFetchingFresh && (
						<p className="mt-1 text-muted-foreground text-xs">
							Updating with latest analysis…
						</p>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
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
			</Card.Header>
			{showEmpty && <InsightsEmptyState />}
			{showInsights && (
				<div
					className={cn(
						"overflow-y-auto",
						variant === "compact"
							? "max-h-[min(400px,60dvh)]"
							: "min-h-0 flex-1"
					)}
				>
					{insights.map((insight) => (
						<InsightRowWrapper insight={insight} key={insight.id} />
					))}
				</div>
			)}
		</Card>
	);
}
