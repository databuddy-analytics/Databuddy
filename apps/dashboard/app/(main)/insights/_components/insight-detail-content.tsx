"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useInsightsLocalState } from "@/app/(main)/insights/hooks/use-insights-local-state";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { insightQueries, type RelatedInsightRow } from "@/lib/insight-api";
import { mapHistoryRowToInsight } from "@/lib/insight-types";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon, LightbulbIcon } from "@databuddy/ui/icons";
import { Card, EmptyState, Skeleton } from "@databuddy/ui";
import { InsightCard } from "./insight-card";

const SEVERITY_DOT: Record<string, string> = {
	critical: "bg-red-500",
	warning: "bg-amber-500",
	info: "bg-muted-foreground",
};

function formatChange(value: number | null): string | null {
	if (value == null || value === 0) {
		return null;
	}
	return `${value > 0 ? "+" : ""}${value.toFixed(0)}%`;
}

export function InsightDetailContent() {
	const params = useParams();
	const router = useRouter();
	const insightId = typeof params.id === "string" ? params.id : "";

	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;

	const { data, isLoading, isError } = useQuery(
		insightQueries.byId(insightId || undefined)
	);
	const relatedQuery = useQuery(insightQueries.related(insightId || undefined));

	const insight = useMemo(
		() => (data?.insight ? mapHistoryRowToInsight(data.insight) : null),
		[data?.insight]
	);

	const insightIds = useMemo(() => (insight ? [insight.id] : []), [insight]);
	const { feedbackById, setFeedbackAction } = useInsightsLocalState(
		orgId,
		insightIds
	);

	const [expanded, setExpanded] = useState(true);

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Insight</h1>
			</TopBar.Title>

			<div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-5">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					href="/insights"
				>
					<ArrowLeftIcon className="size-3.5 shrink-0" />
					All insights
				</Link>

				{isLoading && (
					<Card aria-label="Insight">
						<div className="space-y-3 p-5">
							<Skeleton className="h-5 w-2/3 rounded" />
							<Skeleton className="h-4 w-full rounded" />
							<Skeleton className="h-4 w-4/5 rounded" />
						</div>
					</Card>
				)}

				{!isLoading && insight && (
					<>
						<p className="font-medium text-muted-foreground text-xs">
							{insight.websiteName ?? insight.websiteDomain}
						</p>
						<Card aria-label="Insight">
							<InsightCard
								expanded={expanded}
								feedbackVote={feedbackById[insight.id] ?? null}
								insight={insight}
								onFeedbackAction={(vote) => setFeedbackAction(insight.id, vote)}
								onToggleAction={() => setExpanded((v) => !v)}
							/>
						</Card>
						<RelatedInsights
							isLoading={relatedQuery.isLoading}
							rows={relatedQuery.data?.insights ?? []}
						/>
					</>
				)}

				{!(isLoading || insight) && (
					<EmptyState
						action={{
							label: "All insights",
							onClick: () => router.push("/insights"),
						}}
						description={
							isError
								? "This insight is unavailable, or it belongs to a workspace you can't access."
								: "This insight no longer exists. It may have been cleared, or resolved and aged out of history."
						}
						icon={<LightbulbIcon weight="duotone" />}
						title="Insight not available"
						variant="minimal"
					/>
				)}
			</div>
		</div>
	);
}

function RelatedInsights({
	isLoading,
	rows,
}: {
	isLoading: boolean;
	rows: RelatedInsightRow[];
}) {
	if (isLoading) {
		return (
			<Card aria-label="Related insights">
				<Card.Header>
					<Card.Title className="text-sm">Related insights</Card.Title>
				</Card.Header>
				<div className="space-y-2 p-4">
					{[1, 2, 3].map((i) => (
						<Skeleton className="h-8 w-full rounded" key={i} />
					))}
				</div>
			</Card>
		);
	}

	if (rows.length === 0) {
		return null;
	}

	return (
		<Card aria-label="Related insights">
			<Card.Header>
				<Card.Title className="text-sm">Related insights</Card.Title>
			</Card.Header>
			<div className="divide-y">
				{rows.map((row) => {
					const change = formatChange(row.changePercent);
					return (
						<Link
							className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
							href={`/insights/${row.id}`}
							key={row.id}
						>
							<span
								className={cn(
									"size-1.5 shrink-0 rounded-full",
									SEVERITY_DOT[row.severity] ?? "bg-muted-foreground"
								)}
							/>
							<span className="min-w-0 flex-1 truncate text-foreground text-sm">
								{row.title}
							</span>
							{change && (
								<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
									{change}
								</span>
							)}
						</Link>
					);
				})}
			</div>
		</Card>
	);
}
