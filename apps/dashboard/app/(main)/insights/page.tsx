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
	TrendDownIcon,
	TrendUpIcon,
} from "@databuddy/ui/icons";
import { InvestigationSettings } from "./_components/investigation-settings";
import {
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
					<div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-5">
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
						<Card aria-label="Investigations" id="investigations">
							<Card.Header>
								<Card.Title>Investigations</Card.Title>
								<Card.Description>
									Questions and fixes Databuddy is following through to
									resolution.
								</Card.Description>
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
		<Card aria-label="Latest insights">
			<Card.Header>
				<Card.Title>Latest insights</Card.Title>
				<Card.Description>
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

	return (
		<article className="flex items-start gap-3 px-4 py-4">
			<span
				className={cn(
					"flex size-8 shrink-0 items-center justify-center rounded",
					positive && "bg-emerald-500/10 text-emerald-600",
					negative && !critical && "bg-amber-500/10 text-amber-600",
					critical && "bg-red-500/10 text-red-600",
					!(positive || negative) && "bg-primary/10 text-primary"
				)}
			>
				<Icon className="size-4" weight="duotone" />
			</span>
			<div className="min-w-0 flex-1">
				<h3 className="font-medium text-foreground text-sm leading-snug">
					{insight.title}
				</h3>
				<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
					{insight.summary}
				</p>
				{insight.recommendation ? (
					<div className="mt-2.5 rounded-md border bg-muted/20 p-2.5">
						<p className="text-foreground/80 text-xs leading-relaxed">
							<span className="font-medium text-foreground">Recommended:</span>{" "}
							{insight.recommendation.action}
						</p>
						{insight.signal.entity.type === "goal" &&
						insight.recommendation.operation ? (
							<div className="mt-2 flex flex-wrap gap-1.5">
								<Button
									asChild
									size="sm"
									tone={
										insight.recommendation.operation === "delete"
											? "destructive"
											: "neutral"
									}
									variant={
										insight.recommendation.operation === "delete"
											? "ghost"
											: "secondary"
									}
								>
									<Link
										href={`/websites/${encodeURIComponent(insight.websiteId)}/goals?command=${insight.recommendation.operation}-goal&goalId=${encodeURIComponent(insight.signal.entity.id)}`}
									>
										{insight.recommendation.operation === "delete"
											? "Delete goal"
											: "Edit goal"}
									</Link>
								</Button>
							</div>
						) : null}
					</div>
				) : null}
				{insight.impact ? (
					<p className="mt-1.5 text-foreground/75 text-xs leading-relaxed">
						<span className="font-medium text-foreground">Impact:</span>{" "}
						{insight.impact}
					</p>
				) : null}
				{insight.rootCause ? (
					<p className="mt-1 text-foreground/75 text-xs leading-relaxed">
						<span className="font-medium text-foreground">Cause:</span>{" "}
						{insight.rootCause}
					</p>
				) : null}
				{insight.evidence.length > 0 ? (
					<p className="mt-1 text-muted-foreground text-xs leading-relaxed">
						<span className="font-medium text-foreground">Evidence:</span>{" "}
						{insight.evidence.join(" · ")}
					</p>
				) : null}
				<div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
					<span>{insight.websiteName ?? insight.websiteDomain}</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span>
						<span className="capitalize">
							{insight.signal.entity.type.replaceAll("_", " ")}
						</span>
						: {insight.signal.entity.label}
					</span>
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
					<span>
						{metric.label}: {formatMetricValue(metric.current, metric.format)}
						{metric.previous === undefined
							? ""
							: ` (was ${formatMetricValue(metric.previous, metric.format)})`}
					</span>
					{change !== null && change !== 0 ? (
						<>
							<span className="text-muted-foreground/30">&middot;</span>
							<span
								className={cn(
									"font-medium tabular-nums",
									positive && "text-emerald-600",
									negative && !critical && "text-amber-600",
									critical && "text-red-600"
								)}
							>
								{change > 0 ? "+" : ""}
								{change.toLocaleString("en-US", {
									maximumFractionDigits: 1,
								})}
								%
							</span>
						</>
					) : null}
					<span className="text-muted-foreground/30">&middot;</span>
					<span>{formatComparison(insight.signal.period)}</span>
					<span className="text-muted-foreground/30">&middot;</span>
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
