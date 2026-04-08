"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { SparkleIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { InsightCard } from "@/app/(main)/insights/_components/insight-card";
import { Skeleton } from "@/components/ui/skeleton";
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
	isError?: boolean;
	isFetching?: boolean;
	isFetchingFresh?: boolean;
	isLoading?: boolean;
	onRefreshAction?: () => void;
	/** `compact` = capped list height (home). `full` = grows with parent flex layout (`/insights`). */
	variant?: "compact" | "full";
}

const cardShell = (variant: "compact" | "full") =>
	cn(
		"rounded border bg-card",
		variant === "full" && "flex min-h-0 flex-1 flex-col"
	);

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
			<div className={cardShell(variant)}>
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

	if (isError) {
		return (
			<div className={cardShell(variant)}>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<div className="flex items-center gap-2">
						<SparkleIcon className="size-4 text-primary" weight="duotone" />
						<h3 className="font-semibold text-foreground text-sm">
							Actionable Insights
						</h3>
					</div>
				</div>
				<ErrorState onRetryAction={onRefreshAction} />
			</div>
		);
	}

	const showInsights = insights.length > 0;
	const showEmpty = insights.length === 0;

	return (
		<div className={cardShell(variant)}>
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<div className="flex items-center gap-2">
						<SparkleIcon
							className="size-4 shrink-0 text-primary"
							weight="duotone"
						/>
						<h3 className="font-semibold text-foreground text-sm">
							Actionable Insights
						</h3>
					</div>
					{isFetchingFresh && (
						<p className="text-muted-foreground text-xs">
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
			</div>
			{showEmpty && <EmptyState />}
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
		</div>
	);
}
