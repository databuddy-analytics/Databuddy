"use client";

import Link from "next/link";
import { InvestigationRow } from "@/app/(main)/insights/_components/investigation-row";
import type { Insight } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import {
	ArrowClockwiseIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Card, Skeleton } from "@databuddy/ui";

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

function InsightsLoadingState() {
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
						Loading investigations…
					</p>
					<p className="text-muted-foreground text-xs">
						Fetching cases from the last completed analysis
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
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<LightbulbIcon className="size-5 text-primary" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					No investigations yet
				</p>
				<p className="text-muted-foreground text-xs">
					Databuddy has not opened a case from the latest analysis
				</p>
			</div>
		</div>
	);
}

function InsightsErrorState({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="flex items-center gap-3 px-5 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
				<WarningCircleIcon className="size-5 text-red-500" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					Couldn't load investigations
				</p>
				<p className="text-muted-foreground text-xs">
					Stored investigations couldn't be loaded
				</p>
			</div>
			<Button
				className="shrink-0"
				onClick={onRetryAction}
				size="sm"
				variant="secondary"
			>
				Retry
			</Button>
		</div>
	);
}

interface InsightsSectionProps {
	insights: Insight[];
	isError?: boolean;
	isFetching?: boolean;
	isLoading?: boolean;
	onRefreshAction: () => void;
}

export function SmartInsightsSection({
	insights,
	isLoading,
	isFetching,
	isError,
	onRefreshAction,
}: InsightsSectionProps) {
	const showInsights = !(isLoading || isError) && insights.length > 0;

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<LightbulbIcon
							className="size-4 shrink-0 text-primary"
							weight="duotone"
						/>
						<Card.Title className="text-sm">Investigations</Card.Title>
					</div>
				</div>
				{!(isLoading || isError) && (
					<div className="flex shrink-0 items-center gap-2">
						{showInsights && (
							<span className="text-muted-foreground text-xs">
								{insights.length} {insights.length === 1 ? "case" : "cases"}
							</span>
						)}
						<Link
							className="text-muted-foreground text-xs hover:text-foreground"
							href="/insights"
						>
							View all
						</Link>
						<Button
							aria-label="Refresh investigations"
							className="size-6 text-muted-foreground"
							disabled={isFetching}
							onClick={onRefreshAction}
							size="icon-sm"
							variant="ghost"
						>
							<ArrowClockwiseIcon
								className={cn("size-3.5", isFetching && "animate-spin")}
							/>
						</Button>
					</div>
				)}
			</Card.Header>
			{isLoading && <InsightsLoadingState />}
			{!isLoading && isError && (
				<InsightsErrorState onRetryAction={onRefreshAction} />
			)}
			{!(isLoading || isError || showInsights) && <InsightsEmptyState />}
			{showInsights && (
				<div className="max-h-[min(400px,60dvh)] overflow-y-auto">
					{insights.map((insight) => (
						<InvestigationRow insight={insight} key={insight.id} />
					))}
				</div>
			)}
		</Card>
	);
}
