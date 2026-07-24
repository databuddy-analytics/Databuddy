"use client";

import type { InsightBriefItem } from "@databuddy/shared/insights";
import { Button, Skeleton } from "@databuddy/ui";
import Link from "next/link";
import { List } from "@/components/ui/composables/list";
import type { Insight } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	CheckCircleIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";

type GoalRecommendation = Extract<
	NonNullable<InsightBriefItem["recommendation"]>,
	{ operation: "delete" | "edit" }
>;

export function GoalRecommendationAction({
	goalId,
	recommendation,
	websiteId,
}: {
	goalId: string;
	recommendation: GoalRecommendation;
	websiteId: string;
}) {
	const deleting = recommendation.operation === "delete";

	return (
		<Button
			asChild
			size="sm"
			tone={deleting ? "destructive" : "neutral"}
			variant={deleting ? "ghost" : "secondary"}
		>
			<Link
				href={{
					pathname: `/websites/${encodeURIComponent(websiteId)}/goals`,
					query: {
						command: `${recommendation.operation}-goal`,
						goalId,
						...(recommendation.changes?.description
							? { description: recommendation.changes.description }
							: {}),
						...(recommendation.changes?.name
							? { name: recommendation.changes.name }
							: {}),
					},
				}}
			>
				{deleting ? "Delete goal" : "Review goal changes"}
			</Link>
		</Button>
	);
}

export function InvestigationRowSkeleton() {
	return (
		<div className="flex min-h-24 items-start gap-3 px-4 py-4">
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<Skeleton className="h-4 w-2/5 rounded" />
					<Skeleton className="h-3 w-14 rounded" />
				</div>
				<Skeleton className="h-3 w-full rounded" />
				<Skeleton className="h-3 w-4/5 rounded" />
				<Skeleton className="h-3 w-1/3 rounded" />
			</div>
		</div>
	);
}

function InsightStatusIcon({ insight }: { insight: Insight }) {
	if (insight.status === "resolved") {
		const archived = insight.resolvedReason === "stale";
		return (
			<span
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded",
					archived
						? "bg-muted text-muted-foreground"
						: "bg-emerald-500/10 text-emerald-600"
				)}
			>
				<CheckCircleIcon className="size-4" weight="fill" />
			</span>
		);
	}

	const isInfo = insight.severity === "info";
	const Icon = isInfo ? LightbulbIcon : WarningCircleIcon;

	return (
		<span
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded",
				isInfo && "bg-primary/10 text-primary",
				insight.severity === "critical" && "bg-red-500/10 text-red-500",
				insight.severity === "warning" && "bg-amber-500/10 text-amber-500"
			)}
		>
			<Icon className="size-4" weight="duotone" />
		</span>
	);
}

function resolutionLabel(insight: Insight): string | null {
	if (insight.status !== "resolved") {
		return null;
	}
	if (insight.resolvedReason === "stale") {
		return "Archived";
	}
	return insight.resolvedReason === "recovered" ? "Recovered" : "Resolved";
}

export function InvestigationRow({ insight }: { insight: Insight }) {
	const resolution = resolutionLabel(insight);
	const archived = insight.resolvedReason === "stale";
	const change = insight.changePercent;
	const severity =
		insight.severity === "critical"
			? "Critical"
			: insight.severity === "warning"
				? "Warning"
				: "Notice";

	return (
		<List.Row
			align="start"
			asChild
			className={cn(insight.status === "resolved" && "bg-muted/20")}
		>
			<Link href={`/insights/${insight.id}`}>
				<InsightStatusIcon insight={insight} />
				<span className="min-w-0 flex-1">
					<span className="line-clamp-2 block font-medium text-foreground text-sm leading-snug">
						{insight.title}
					</span>
					<span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
						{insight.description}
					</span>
					<span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
						<span className="truncate">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">&middot;</span>
						<span
							className={cn(
								"font-medium",
								resolution && archived && "text-muted-foreground",
								resolution && !archived && "text-emerald-600",
								!resolution &&
									insight.severity === "critical" &&
									"text-red-500",
								!resolution &&
									insight.severity === "warning" &&
									"text-amber-600",
								!resolution && insight.severity === "info" && "text-primary"
							)}
						>
							{resolution ?? severity}
						</span>
						{change !== undefined && change !== 0 && (
							<>
								<span className="text-muted-foreground/30">&middot;</span>
								<span
									className={cn(
										"tabular-nums",
										insight.sentiment === "positive" && "text-emerald-600",
										insight.sentiment === "negative" && "text-red-500"
									)}
								>
									{change > 0 ? "+" : ""}
									{change}%
								</span>
							</>
						)}
					</span>
				</span>
				<ArrowRightIcon
					aria-hidden
					className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
					weight="bold"
				/>
			</Link>
		</List.Row>
	);
}
