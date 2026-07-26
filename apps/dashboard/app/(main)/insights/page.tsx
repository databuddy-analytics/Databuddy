"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import { type BriefInsight, insightQueries } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, fromNow } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	GlobeIcon,
	LightbulbIcon,
	TrendDownIcon,
	TrendUpIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./_components/investigation-settings";
import {
	GoalRecommendationAction,
	InvestigationRow,
	InvestigationRowSkeleton,
} from "./_components/investigation-row";
import { useInsightsFeed } from "./hooks/use-insights-feed";

const PERIOD_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

export default function InsightsPage() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const orgId = activeOrganization?.id ?? activeOrganizationId ?? undefined;
	const feed = useInsightsFeed();
	const { isLoading, isRefreshing, refetch } = feed;
	const brief = useInfiniteQuery(insightQueries.briefInfinite(orgId));
	const briefInsights =
		brief.data?.pages.flatMap((page) => page.insights) ?? [];
	const refetchBrief = brief.refetch;
	const { websites, isLoading: websitesLoading } = useWebsitesLight();
	const hasNoWebsites =
		!websitesLoading && websites !== undefined && websites.length === 0;
	const refresh = useCallback(() => {
		Promise.all([refetch(), refetchBrief()]).catch(() => undefined);
	}, [refetch, refetchBrief]);

	return (
		<div
			aria-busy={isLoading || brief.isLoading || websitesLoading}
			className="flex h-full flex-col"
		>
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Insights</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh insights"
					disabled={isLoading || brief.isLoading || websitesLoading}
					onClick={refresh}
					size="sm"
					type="button"
					variant="ghost"
				>
					<ArrowClockwiseIcon
						aria-hidden
						className={cn(
							"size-3.5 shrink-0",
							(isRefreshing || brief.isFetching) && "animate-spin"
						)}
					/>
				</Button>
				<InvestigationSettings organizationId={orgId} />
			</TopBar.Actions>

			{hasNoWebsites ? (
				<EmptyOrg />
			) : (
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
					<div className="mx-auto w-full max-w-4xl space-y-8 p-4 sm:p-6">
						<InsightBrief
							hasNextPage={brief.hasNextPage ?? false}
							insights={briefInsights}
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
									: briefInsights.length === 0 && brief.isError
										? "error"
										: "ready"
							}
						/>
						<Card
							aria-label="Investigations"
							className="border-border/70 shadow-sm"
							id="investigations"
						>
							<Card.Header className="border-b bg-card">
								<div className="flex items-baseline justify-between gap-4">
									<div>
										<Card.Title>Investigations</Card.Title>
										<Card.Description className="mt-1">
											Open questions Databuddy is following through to
											resolution.
										</Card.Description>
									</div>
									<span className="hidden text-[11px] text-muted-foreground sm:block">
										Follow-up queue
									</span>
								</div>
							</Card.Header>
							<Card.Content className="p-0">
								<InvestigationList feed={feed} />
							</Card.Content>
						</Card>
					</div>
				</div>
			)}
		</div>
	);
}

function InsightBrief({
	hasNextPage,
	insights,
	isFetchingNextPage,
	onLoadMoreAction,
	onRetryAction,
	state,
}: {
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
				<Card.Description className="mt-1">
					What changed, why it matters, and what to do next.
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
				<Icon className="size-4" weight="duotone" />
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
				<p className="mt-1.5 max-w-3xl text-muted-foreground text-sm leading-relaxed">
					{insight.summary}
				</p>
				{insight.recommendation ? (
					<div className="mt-3 rounded-md border border-primary/15 bg-primary/[0.035] px-3 py-2.5">
						<p className="text-foreground/85 text-sm leading-relaxed">
							<span className="mr-1 font-semibold text-primary text-xs uppercase tracking-wide">
								Next step
							</span>
							{insight.recommendation.action}
						</p>
						{insight.signal.entity.type === "goal" &&
						insight.recommendation.operation ? (
							<div className="mt-2 flex flex-wrap gap-1.5">
								<GoalRecommendationAction
									goalId={insight.signal.entity.id}
									recommendation={insight.recommendation}
									websiteId={insight.websiteId}
								/>
							</div>
						) : null}
					</div>
				) : null}
				{insight.impact || insight.rootCause || insight.evidence.length > 0 ? (
					<dl className="mt-3 grid gap-2 border-muted border-l-2 pl-3 text-xs leading-relaxed sm:grid-cols-2 sm:gap-x-5">
						{insight.impact ? (
							<div>
								<dt className="font-semibold text-foreground/75">
									Why it matters
								</dt>
								<dd className="mt-0.5 text-muted-foreground">
									{insight.impact}
								</dd>
							</div>
						) : null}
						{insight.rootCause ? (
							<div>
								<dt className="font-semibold text-foreground/75">
									What explains it
								</dt>
								<dd className="mt-0.5 text-muted-foreground">
									{insight.rootCause}
								</dd>
							</div>
						) : null}
						{insight.evidence.length > 0 ? (
							<div className="sm:col-span-2">
								<dt className="font-semibold text-foreground/75">Evidence</dt>
								<dd className="mt-0.5 text-muted-foreground">
									{insight.evidence.join(" · ")}
								</dd>
							</div>
						) : null}
					</dl>
				) : null}
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
					<Link
						aria-label={`Open investigation: ${insight.title}`}
						className="mt-2 inline-flex items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
						href={`/insights/${insight.investigationId}`}
					>
						Open investigation
						<ArrowRightIcon className="size-3" weight="bold" />
					</Link>
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

function InvestigationList({
	feed,
}: {
	feed: ReturnType<typeof useInsightsFeed>;
}) {
	const {
		fetchNextPage,
		hasNextPage,
		insights,
		isError,
		isFetchingNextPage,
		isLoading,
		refetch,
	} = feed;
	const loadMore = useCallback(() => {
		fetchNextPage().catch(() => undefined);
	}, [fetchNextPage]);

	if (isLoading) {
		return (
			<div
				aria-label="Loading investigations"
				aria-live="polite"
				className="divide-y"
				role="status"
			>
				{Array.from({ length: 4 }, (_, index) => (
					<InvestigationRowSkeleton key={`investigation-${index + 1}`} />
				))}
			</div>
		);
	}

	if (isError) {
		return <ErrorState onRetryAction={refetch} />;
	}

	if (insights.length === 0) {
		return <EmptyList />;
	}

	return (
		<>
			<div>
				{insights.map((insight) => (
					<InvestigationRow insight={insight} key={insight.id} />
				))}
			</div>

			{hasNextPage ? (
				<div className="flex justify-center border-t px-5 py-4">
					<Button
						disabled={isFetchingNextPage}
						loading={isFetchingNextPage}
						onClick={loadMore}
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

function ErrorState({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="px-5 py-12">
			<EmptyState
				action={{
					label: "Try again",
					onClick: onRetryAction,
					variant: "secondary",
				}}
				description="Databuddy couldn't load recent investigations."
				icon={<LightbulbIcon weight="duotone" />}
				title="Couldn't load investigations"
				variant="error"
			/>
		</div>
	);
}

function EmptyList() {
	return (
		<div className="px-5 py-12">
			<EmptyState
				description="Databuddy starts an investigation when it finds a question or fix worth following through."
				icon={<LightbulbIcon weight="duotone" />}
				title="No investigations yet"
				variant="minimal"
			/>
		</div>
	);
}

function EmptyOrg() {
	return (
		<EmptyState
			action={{
				label: "Go to websites",
				onClick: () => {
					window.location.href = "/websites";
				},
			}}
			description="Add a website to start receiving insights across your organization."
			icon={<GlobeIcon weight="duotone" />}
			title="No websites yet"
			variant="minimal"
		/>
	);
}
