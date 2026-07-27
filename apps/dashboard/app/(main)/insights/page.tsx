"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { type ReactNode, useCallback } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { useWebsitesLight } from "@/hooks/use-websites";
import { type BriefInsight, insightQueries } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import { Button, Card, EmptyState, fromNow } from "@databuddy/ui";
import {
	ArrowClockwiseIcon,
	ArrowRightIcon,
	GlobeIcon,
	LightbulbIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./_components/investigation-settings";
import {
	GoalRecommendationAction,
	InvestigationRow,
	InvestigationRowSkeleton,
} from "./_components/investigation-row";
import { useInsightsFeed } from "./hooks/use-insights-feed";

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
					<div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5 sm:px-6 sm:py-7">
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
							className="rounded-lg shadow-none"
							id="investigations"
						>
							<Card.Header className="border-b px-5 py-3.5 sm:px-6">
								<Card.Title>Investigations</Card.Title>
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
		<Card aria-label="Latest insights" className="rounded-lg shadow-none">
			<Card.Header className="border-b px-5 py-3.5 sm:px-6">
				<Card.Title>Latest insights</Card.Title>
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
	const metric = insight.signal.metric;

	return (
		<article className="px-5 py-4 sm:px-6">
			<div className="min-w-0">
				<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
					<h3 className="max-w-2xl font-medium text-foreground text-sm leading-snug">
						{insight.title}
					</h3>
					{change !== null && change !== 0 ? (
						<span
							className={cn(
								"shrink-0 font-medium text-xs tabular-nums",
								positive && "text-emerald-700",
								negative && !critical && "text-amber-700",
								critical && "text-red-700"
							)}
						>
							{change > 0 ? "+" : ""}
							{change.toLocaleString("en-US", {
								maximumFractionDigits: 1,
							})}
							%
						</span>
					) : null}
				</div>
				<p className="mt-1 max-w-3xl text-muted-foreground text-sm leading-relaxed">
					{insight.summary}
				</p>
				{insight.impact ? (
					<p className="mt-1 max-w-3xl text-foreground/80 text-sm leading-relaxed">
						{insight.impact}
					</p>
				) : null}
				{insight.recommendation ? (
					<div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
						<p className="font-medium text-foreground/85 leading-relaxed">
							{insight.recommendation.action}
						</p>
						{insight.signal.entity.type === "goal" &&
						insight.recommendation.operation ? (
							<div className="flex flex-wrap gap-1.5">
								<GoalRecommendationAction
									goalId={insight.signal.entity.id}
									recommendation={insight.recommendation}
									websiteId={insight.websiteId}
								/>
							</div>
						) : null}
					</div>
				) : null}
				<div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
					<span className="font-medium text-foreground/70">
						{insight.websiteName ?? insight.websiteDomain}
					</span>
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
					<span>{fromNow(insight.createdAt)}</span>
				</div>
				{insight.investigationId ? (
					<Button asChild className="mt-1.5 -ml-2" size="sm" variant="ghost">
						<Link
							aria-label={`Review investigation: ${insight.title}`}
							href={`/insights/${insight.investigationId}`}
						>
							Review
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
	const openInsights = insights.filter((insight) => insight.status === "open");
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

	if (openInsights.length === 0) {
		return (
			<EmptyList
				hasNextPage={hasNextPage}
				isFetchingNextPage={isFetchingNextPage}
				onLoadMoreAction={loadMore}
			/>
		);
	}

	return (
		<>
			<div>
				{openInsights.map((insight) => (
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

function EmptyList({
	hasNextPage,
	isFetchingNextPage,
	onLoadMoreAction,
}: {
	hasNextPage: boolean;
	isFetchingNextPage: boolean;
	onLoadMoreAction: () => void;
}) {
	return (
		<div className="px-5 py-12">
			<EmptyState
				action={
					hasNextPage
						? {
								label: isFetchingNextPage ? "Loading…" : "Load more",
								onClick: onLoadMoreAction,
								variant: "secondary",
							}
						: undefined
				}
				description={
					hasNextPage
						? "No open investigations in the latest results."
						: "Databuddy starts an investigation when it finds a question or fix worth following through."
				}
				icon={<LightbulbIcon weight="duotone" />}
				title="Nothing needs your input"
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
