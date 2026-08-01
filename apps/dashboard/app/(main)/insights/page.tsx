"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { type BriefInsight, insightQueries } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, fromNow } from "@databuddy/ui";
import {
	ArrowRightIcon,
	LightbulbIcon,
	TrendDownIcon,
	TrendUpIcon,
} from "@databuddy/ui/icons";
import { latestRunDescription } from "./_lib/insight-run";

const PERIOD_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

export default function InsightsPage() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;
	const brief = useInfiniteQuery(insightQueries.briefInfinite(organizationId));
	const latestRun = useQuery({
		...orpc.insightGeneration.getLatestRun.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
		meta: { suppressGlobalErrorToast: true },
	});
	const insights = brief.data?.pages.flatMap((page) => page.insights) ?? [];

	return (
		<div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
			<InsightBrief
				description={latestRunDescription(latestRun.data)}
				hasNextPage={brief.hasNextPage ?? false}
				insights={insights}
				isFetchingNextPage={brief.isFetchingNextPage}
				onLoadMoreAction={() => {
					brief.fetchNextPage().catch(() => undefined);
				}}
				onRetryAction={() => {
					brief.refetch().catch(() => undefined);
				}}
				state={
					brief.isLoading
						? "loading"
						: insights.length === 0 && brief.isError
							? "error"
							: "ready"
				}
			/>
		</div>
	);
}

function InsightBrief({
	description,
	hasNextPage,
	insights,
	isFetchingNextPage,
	onLoadMoreAction,
	onRetryAction,
	state,
}: {
	description: string;
	hasNextPage: boolean;
	insights: BriefInsight[];
	isFetchingNextPage: boolean;
	onLoadMoreAction: () => void;
	onRetryAction: () => void;
	state: "error" | "loading" | "ready";
}) {
	let content: ReactNode;
	if (state === "loading") {
		content = (
			<div
				aria-label="Loading insights"
				aria-live="polite"
				className="px-5 py-8 text-muted-foreground text-sm"
				role="status"
			>
				Looking for noteworthy changes…
			</div>
		);
	} else if (state === "error") {
		content = (
			<div className="px-5 py-8">
				<EmptyState
					action={{
						label: "Try again",
						onClick: onRetryAction,
						variant: "secondary",
					}}
					description="Databuddy couldn't load recent insights."
					icon={<LightbulbIcon weight="duotone" />}
					title="Couldn't load insights"
					variant="error"
				/>
			</div>
		);
	} else if (insights.length === 0) {
		content = (
			<div className="px-5 py-8">
				<EmptyState
					description="Noteworthy changes, improvements, and recoveries will appear here."
					icon={<LightbulbIcon weight="duotone" />}
					title="No insights yet"
					variant="minimal"
				/>
			</div>
		);
	} else {
		content = (
			<>
				<div className="divide-y">
					{insights.map((insight) => (
						<InsightBriefRow insight={insight} key={insight.id} />
					))}
				</div>
				{hasNextPage ? (
					<div className="flex justify-center border-t px-5 py-4">
						<Button
							disabled={isFetchingNextPage}
							loading={isFetchingNextPage}
							onClick={onLoadMoreAction}
							type="button"
							variant="secondary"
						>
							Load more
						</Button>
					</div>
				) : null}
			</>
		);
	}

	return (
		<Card aria-label="Latest insights" className="border-border/70 shadow-sm">
			<Card.Header className="border-b bg-card px-5 py-4 sm:px-6">
				<Card.Title>Latest insights</Card.Title>
				<Card.Description aria-live="polite" className="mt-1">
					{description}
				</Card.Description>
			</Card.Header>
			<Card.Content className="p-0">{content}</Card.Content>
		</Card>
	);
}

function InsightBriefRow({ insight }: { insight: BriefInsight }) {
	const positive = insight.signal.sentiment === "positive";
	const negative = insight.signal.sentiment === "negative";
	const critical = negative && insight.signal.severity === "critical";
	const change = insight.signal.changePercent;
	const Icon =
		change !== null && change > 0
			? TrendUpIcon
			: change !== null && change < 0
				? TrendDownIcon
				: LightbulbIcon;
	const metric = insight.signal.metric;
	const entityType = insight.signal.entity.type.replaceAll("_", " ");

	return (
		<article className="group relative flex items-start gap-3 px-5 py-5 sm:gap-4 sm:px-6">
			<span
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
					positive && "bg-emerald-500/10 text-emerald-600",
					negative && !critical && "bg-amber-500/10 text-amber-600",
					critical && "bg-red-500/10 text-red-600",
					!(positive || negative) && "bg-primary/10 text-primary"
				)}
			>
				<Icon aria-hidden className="size-4" weight="duotone" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
					<h3 className="max-w-2xl font-semibold text-foreground text-sm leading-snug">
						{insight.title}
					</h3>
					{change !== null && change !== 0 ? (
						<Badge
							className={cn(
								"shrink-0 tabular-nums",
								positive && "bg-emerald-500/10 text-emerald-700",
								negative && !critical && "bg-amber-500/10 text-amber-700",
								critical && "bg-red-500/10 text-red-700"
							)}
							size="sm"
							variant="muted"
						>
							{change > 0 ? "+" : ""}
							{change.toLocaleString("en-US", {
								maximumFractionDigits: 1,
							})}
							%
						</Badge>
					) : null}
				</div>
				<dl className="mt-3 grid gap-2 border-muted border-l-2 pl-3 text-xs leading-relaxed sm:grid-cols-2 sm:gap-x-5">
					<div className="sm:col-span-2">
						<dt className="font-semibold text-foreground/75">What happened</dt>
						<dd className="mt-0.5 max-w-3xl text-muted-foreground text-sm leading-relaxed">
							{insight.summary}
						</dd>
					</div>
					{insight.impact ? (
						<div>
							<dt className="font-semibold text-foreground/75">
								Why it matters
							</dt>
							<dd className="mt-0.5 text-muted-foreground">{insight.impact}</dd>
						</div>
					) : null}
					{insight.rootCause ? (
						<div>
							<dt className="font-semibold text-foreground/75">
								Why it happened
							</dt>
							<dd className="mt-0.5 text-muted-foreground">
								{insight.rootCause}
							</dd>
						</div>
					) : null}
					<div className="sm:col-span-2">
						<dt className="font-semibold text-foreground/75">Evidence</dt>
						<dd className="mt-0.5 text-muted-foreground">
							{insight.evidence.join(" · ")}
						</dd>
					</div>
				</dl>
				<div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t pt-3 text-[11px] text-muted-foreground">
					<span className="font-medium text-foreground/70">
						{insight.websiteName ?? insight.websiteDomain}
					</span>
					<span aria-hidden className="text-muted-foreground/30">
						&middot;
					</span>
					<span className="capitalize">{entityType}</span>
					<span aria-hidden className="text-muted-foreground/30">
						&middot;
					</span>
					<span className="tabular-nums">
						{formatMetricValue(metric.current, metric.format)}
						{metric.previous === undefined
							? ""
							: ` vs ${formatMetricValue(metric.previous, metric.format)}`}
					</span>
					<span aria-hidden className="text-muted-foreground/30">
						&middot;
					</span>
					<span>{formatComparison(insight.signal.period)}</span>
					<span aria-hidden className="text-muted-foreground/30">
						&middot;
					</span>
					<span>{fromNow(insight.createdAt)}</span>
				</div>
				{insight.investigationId ? (
					<Button asChild className="mt-3" size="sm" variant="secondary">
						<Link
							aria-label={`Review investigation: ${insight.title}`}
							href={`/insights/${insight.investigationId}`}
						>
							Review & respond
							<ArrowRightIcon className="size-3" weight="bold" />
						</Link>
					</Button>
				) : null}
			</div>
		</article>
	);
}

function formatMetricValue(
	value: number,
	format: BriefInsight["signal"]["metric"]["format"]
) {
	const pretty = value.toLocaleString("en-US", {
		maximumFractionDigits: 2,
	});
	if (format === "percent") {
		return `${pretty}%`;
	}
	if (format === "duration_ms") {
		return `${pretty}ms`;
	}
	if (format === "duration_s") {
		return `${pretty}s`;
	}
	return pretty;
}

function formatComparison(period: BriefInsight["signal"]["period"]) {
	return `${formatWindow(period.current)} vs ${formatWindow(period.previous)}`;
}

function formatWindow(window: { from: string; to: string }) {
	return window.from === window.to
		? formatDate(window.from)
		: `${formatDate(window.from)}–${formatDate(window.to)}`;
}

function formatDate(value: string) {
	return PERIOD_DATE_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}
