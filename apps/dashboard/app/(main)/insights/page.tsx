"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode, useEffect, useRef, useState } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import {
	useBillingContext,
	useUsageFeature,
} from "@/components/providers/billing-provider";
import { type BriefInsight, insightQueries } from "@/lib/insight-api";
import { APP_EVENTS, trackAppEvent } from "@/lib/app-events";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, EmptyState, fromNow } from "@databuddy/ui";
import {
	ArrowRightIcon,
	CheckCircleIcon,
	CircleNotchIcon,
	ClockIcon,
	CoinsIcon,
	LightbulbIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { toast } from "sonner";
import { latestRunDescription } from "./_lib/insight-run";

const PERIOD_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
	timeZone: "UTC",
	year: "numeric",
});

export default function InsightsPage() {
	return (
		<Suspense fallback={null}>
			<InsightsPageContent />
		</Suspense>
	);
}

function InsightsPageContent() {
	const { activeOrganization, activeOrganizationId } =
		useOrganizationsContext();
	const organizationId =
		activeOrganization?.id ?? activeOrganizationId ?? undefined;
	const searchParams = useSearchParams();
	const firstReviewWebsiteId =
		searchParams.get("firstReview")?.trim() || undefined;
	const { balance: investigationCredits, unlimited } =
		useUsageFeature("agent_credits");
	const { isLoading: billingLoading } = useBillingContext();
	const latestRun = useQuery({
		...orpc.insightGeneration.getLatestRun.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId && !firstReviewWebsiteId),
		meta: { suppressGlobalErrorToast: true },
	});
	const firstReview = useQuery({
		...orpc.insightGeneration.getFirstReviewReadiness.queryOptions({
			input: {
				organizationId,
				websiteId: firstReviewWebsiteId ?? "",
			},
		}),
		enabled: Boolean(organizationId && firstReviewWebsiteId),
		meta: { suppressGlobalErrorToast: true },
	});
	const startedFirstReviewRuns = useRef(new Set<string>());
	const refreshingReusedFirstReviewRun = useRef<string | null>(null);
	const viewedFirstReviewWebsite = useRef<string | null>(null);
	const [reusedFirstReviewRun, setReusedFirstReviewRun] = useState<{
		runId: string;
		websiteId: string;
	} | null>(null);
	const reusedFirstReviewRunId =
		reusedFirstReviewRun &&
		reusedFirstReviewRun.websiteId === firstReviewWebsiteId
			? reusedFirstReviewRun.runId
			: null;
	const triggerFirstReview = useMutation({
		...orpc.insightGeneration.triggerRun.mutationOptions(),
		onError: (error) =>
			toast.error(
				error instanceof Error
					? error.message
					: "Couldn't start your first review"
			),
		onSuccess: (run) => {
			if (run.reusedRun) {
				toast.info("An analysis is already in progress");
				if (run.runId && firstReviewWebsiteId) {
					setReusedFirstReviewRun({
						runId: run.runId,
						websiteId: firstReviewWebsiteId,
					});
				}
				return;
			}
			if (run.runId && firstReviewWebsiteId) {
				startedFirstReviewRuns.current.add(run.runId);
				trackAppEvent(APP_EVENTS.firstReviewStarted, {
					website_id: firstReviewWebsiteId,
				});
			}
			toast.success("Your first review has started");
		},
	});
	const hasStartedFirstReview = Boolean(
		triggerFirstReview.data?.runId && !triggerFirstReview.data.reusedRun
	);
	const shouldPollFirstReviewStatus = Boolean(
		organizationId &&
			firstReviewWebsiteId &&
			(reusedFirstReviewRunId ||
				hasStartedFirstReview ||
				isFirstReviewActive(firstReview.data?.state))
	);
	const firstReviewStatusOptions =
		orpc.insightGeneration.getFirstReviewStatus.queryOptions({
			input: {
				organizationId,
				websiteId: firstReviewWebsiteId ?? "",
			},
		});
	const firstReviewStatus = useQuery({
		...firstReviewStatusOptions,
		queryKey: [...firstReviewStatusOptions.queryKey, reusedFirstReviewRunId],
		enabled: shouldPollFirstReviewStatus,
		meta: { suppressGlobalErrorToast: true },
		refetchInterval: (query) => {
			const status = query.state.data;
			return isFirstReviewStatusActive(status?.state) ||
				(reusedFirstReviewRunId &&
					status?.activeOrganizationRunId === reusedFirstReviewRunId)
				? 2000
				: false;
		},
	});
	const firstReviewStatusState = firstReviewStatus.data?.state;
	const reusedRunIsStillActive = Boolean(
		reusedFirstReviewRunId &&
			firstReviewStatus.data?.activeOrganizationRunId === reusedFirstReviewRunId
	);
	const reusedRunReviewsThisWebsite = Boolean(
		reusedRunIsStillActive && firstReviewStatusState === "running"
	);
	const reusedRunReachedTerminalState = Boolean(
		reusedFirstReviewRunId &&
			firstReviewStatus.data?.latestRun?.id === reusedFirstReviewRunId &&
			firstReviewStatusState !== "running"
	);
	const reusedRunState: "checking" | "updating" | "waiting" | null =
		reusedFirstReviewRunId === null
			? null
			: firstReviewStatus.data === undefined
				? "checking"
				: reusedRunReviewsThisWebsite
					? null
					: reusedRunReachedTerminalState || !reusedRunIsStillActive
						? "updating"
						: reusedRunIsStillActive
							? "waiting"
							: "updating";
	const needsFirstReviewRefresh = Boolean(
		!(hasStartedFirstReview || reusedFirstReviewRunId) &&
			firstReviewStatusState === "not_started" &&
			isFirstReviewActive(firstReview.data?.state)
	);
	const firstReviewState =
		triggerFirstReview.isPending ||
		(hasStartedFirstReview &&
			(!firstReviewStatusState || firstReviewStatusState === "not_started"))
			? "running"
			: reusedRunState
				? "waiting_for_organization_run"
				: firstReviewStatusState && firstReviewStatusState !== "not_started"
					? firstReviewStatusState
					: firstReview.data?.state;
	const latestFirstReviewRun =
		firstReviewStatus.data?.latestRun ?? firstReview.data?.latestRun ?? null;
	const canRunFirstReview =
		firstReviewStatus.data?.canRun ?? firstReview.data?.canRun ?? false;
	const firstReviewRunId = latestFirstReviewRun?.id;
	const showFirstReviewFindings =
		!firstReviewWebsiteId ||
		(isFirstReviewComplete(firstReviewState) && Boolean(firstReviewRunId));
	const brief = useInfiniteQuery({
		...insightQueries.briefInfinite(
			organizationId,
			firstReviewWebsiteId,
			firstReviewRunId
		),
		enabled: Boolean(organizationId && showFirstReviewFindings),
	});
	const insights = brief.data?.pages.flatMap((page) => page.insights) ?? [];

	useEffect(() => {
		if (
			!(reusedFirstReviewRunId && firstReviewStatus.isSuccess) ||
			(reusedRunIsStillActive && !reusedRunReachedTerminalState) ||
			refreshingReusedFirstReviewRun.current === reusedFirstReviewRunId
		) {
			return;
		}

		const runId = reusedFirstReviewRunId;
		refreshingReusedFirstReviewRun.current = runId;
		// The inexpensive status poll observed this run leave the site's active
		// state. Refresh ClickHouse-backed readiness once before restoring it.
		firstReview
			.refetch()
			.catch(() => undefined)
			.finally(() => {
				if (refreshingReusedFirstReviewRun.current !== runId) {
					return;
				}
				refreshingReusedFirstReviewRun.current = null;
				setReusedFirstReviewRun((current) =>
					current?.runId === runId && current.websiteId === firstReviewWebsiteId
						? null
						: current
				);
			});
	}, [
		firstReview.refetch,
		firstReviewStatus.data?.activeOrganizationRunId,
		firstReviewStatus.isSuccess,
		firstReviewWebsiteId,
		reusedFirstReviewRunId,
		reusedRunIsStillActive,
		reusedRunReachedTerminalState,
	]);

	useEffect(() => {
		if (
			!(firstReviewWebsiteId && firstReview.isSuccess) ||
			viewedFirstReviewWebsite.current === firstReviewWebsiteId
		) {
			return;
		}
		viewedFirstReviewWebsite.current = firstReviewWebsiteId;
		trackAppEvent(APP_EVENTS.firstReviewViewed, {
			website_id: firstReviewWebsiteId,
		});
	}, [firstReview.isSuccess, firstReviewWebsiteId]);

	useEffect(() => {
		const completedRun = latestFirstReviewRun;
		if (
			!(
				isFirstReviewComplete(firstReviewState) &&
				completedRun &&
				startedFirstReviewRuns.current.delete(completedRun.id) &&
				firstReviewWebsiteId
			)
		) {
			return;
		}
		trackAppEvent(APP_EVENTS.firstReviewCompleted, {
			published_insights: completedRun.insightCount,
			website_id: firstReviewWebsiteId,
		});
	}, [firstReviewState, firstReviewWebsiteId, latestFirstReviewRun]);

	return (
		<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:gap-5 sm:p-6">
			{firstReviewWebsiteId ? (
				<FirstReview
					billingLoading={billingLoading}
					canRun={canRunFirstReview}
					canUseCredits={unlimited || investigationCredits > 0}
					error={
						firstReview.isError ||
						(shouldPollFirstReviewStatus && firstReviewStatus.isError)
					}
					isLoading={firstReview.isLoading}
					needsRefresh={needsFirstReviewRefresh}
					reusedRunState={reusedRunState}
					onRetry={() => {
						firstReview.refetch().catch(() => undefined);
						if (shouldPollFirstReviewStatus) {
							firstReviewStatus.refetch().catch(() => undefined);
						}
					}}
					onRun={() => {
						if (!organizationId) {
							return;
						}
						triggerFirstReview.mutate({
							organizationId,
							websiteIds: [firstReviewWebsiteId],
						});
					}}
					latestRun={latestFirstReviewRun}
					readiness={firstReview.data}
					state={firstReviewState}
					websiteId={firstReviewWebsiteId}
				/>
			) : null}
			{showFirstReviewFindings ? (
				<InsightBrief
					description={
						firstReviewWebsiteId
							? "Findings from this review only."
							: latestRunDescription(latestRun.data)
					}
					emptyDescription={
						isFirstReviewComplete(firstReviewState)
							? "The review found nothing that needs your attention."
							: undefined
					}
					emptyTitle={
						isFirstReviewComplete(firstReviewState)
							? "No material findings"
							: undefined
					}
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
					title={
						firstReviewWebsiteId ? "First review findings" : "Latest insights"
					}
				/>
			) : null}
		</div>
	);
}

type FirstReviewReadiness = Awaited<
	ReturnType<typeof orpc.insightGeneration.getFirstReviewReadiness.call>
>;
type FirstReviewState = FirstReviewReadiness["state"];
type FirstReviewRun = FirstReviewReadiness["latestRun"];

function FirstReview({
	billingLoading,
	canRun,
	canUseCredits,
	error,
	isLoading,
	latestRun,
	needsRefresh,
	reusedRunState,
	onRetry,
	onRun,
	readiness,
	state,
	websiteId,
}: {
	billingLoading: boolean;
	canRun: boolean;
	canUseCredits: boolean;
	error: boolean;
	isLoading: boolean;
	latestRun: FirstReviewRun;
	needsRefresh: boolean;
	reusedRunState: "checking" | "updating" | "waiting" | null;
	onRetry: () => void;
	onRun: () => void;
	readiness: FirstReviewReadiness | undefined;
	state: FirstReviewState | undefined;
	websiteId: string;
}) {
	if (isLoading) {
		return (
			<Card aria-busy="true" aria-label="Checking first review readiness">
				<Card.Content className="flex items-center gap-3 py-5">
					<CircleNotchIcon
						aria-hidden
						className="size-5 animate-spin text-primary"
						weight="duotone"
					/>
					<div>
						<p className="font-medium text-sm">Checking your first review</p>
						<p className="mt-0.5 text-muted-foreground text-xs">
							Verifying tracking and the comparison baseline.
						</p>
					</div>
				</Card.Content>
			</Card>
		);
	}

	if (error || !readiness || !state) {
		return (
			<Card
				aria-label="First review readiness"
				className="border-destructive/30"
			>
				<Card.Content className="flex flex-wrap items-center gap-3 py-5">
					<WarningCircleIcon
						aria-hidden
						className="size-5 text-destructive"
						weight="duotone"
					/>
					<div className="min-w-0 flex-1">
						<p className="font-medium text-sm">
							Couldn't check your first review
						</p>
						<p className="mt-0.5 text-muted-foreground text-xs">
							Try again before starting an analysis.
						</p>
					</div>
					<Button onClick={onRetry} size="sm" variant="secondary">
						Try again
					</Button>
				</Card.Content>
			</Card>
		);
	}

	const activity = formatFirstReviewActivity(readiness.activity);
	const trendReadyAt = readiness.baselineReadyAt
		? formatFirstReviewDate(readiness.baselineReadyAt)
		: null;
	const status = FIRST_REVIEW_STATUSES[state];
	const insightCount = latestRun?.insightCount ?? 0;
	const reviewComplete = isFirstReviewComplete(state);
	const description =
		reusedRunState === "checking"
			? "Checking whether the active organization analysis includes this site."
			: reusedRunState === "waiting"
				? "This site was not started. Run its first review after the current organization analysis finishes."
				: reusedRunState === "updating"
					? "Updating this site's review status."
					: needsRefresh
						? "The other analysis finished. Refresh to check whether this site is ready."
						: state === "collecting_baseline"
							? trendReadyAt
								? `Tracking is working. Trend review is available on ${trendReadyAt}.`
								: "Tracking is working. Databuddy is collecting comparison history."
							: reviewComplete
								? insightCount > 0
									? `${insightCount} finding${insightCount === 1 ? " is" : "s are"} ready below.`
									: "Databuddy reviewed this site and found nothing material to publish."
								: status.description;
	const title =
		reusedRunState === "checking"
			? "Checking the active analysis"
			: reusedRunState === "waiting"
				? "Another analysis is in progress"
				: reusedRunState === "updating"
					? "Updating your review status"
					: needsRefresh
						? "Check whether your review is ready"
						: reviewComplete
							? insightCount > 0
								? `${insightCount} finding${insightCount === 1 ? " is" : "s are"} ready to review`
								: "No material finding needs your attention"
							: status.title;
	let action: ReactNode = needsRefresh ? (
		<Button onClick={onRetry} size="sm" variant="secondary">
			Refresh status
		</Button>
	) : null;
	if (!needsRefresh && canRun && status.action === "tracking") {
		action = (
			<Button asChild size="sm">
				<Link href={`/websites/${websiteId}/settings/tracking`}>
					Open tracking setup
					<ArrowRightIcon className="size-3" weight="bold" />
				</Link>
			</Button>
		);
	} else if (!needsRefresh && canRun && status.action === "review") {
		action = billingLoading ? (
			<Button disabled loading size="sm">
				Checking credits
			</Button>
		) : canUseCredits ? (
			<Button onClick={onRun} size="sm">
				{state === "ready" ? "Run first review" : "Retry first review"}
				<ArrowRightIcon className="size-3" weight="bold" />
			</Button>
		) : (
			<Button asChild size="sm">
				<Link href="/billing#topup">
					<CoinsIcon className="size-3.5" weight="duotone" />
					Add investigation credits
				</Link>
			</Button>
		);
	}
	const permissionDescription =
		!(needsRefresh || canRun) && status.action
			? "Ask someone with access to run it."
			: null;

	return (
		<Card
			aria-label="First review"
			className={FIRST_REVIEW_CARD_CLASSES[status.badgeVariant]}
		>
			<Card.Content className="flex flex-wrap items-start gap-3 py-5 sm:flex-nowrap">
				<span className="flex size-10 shrink-0 items-center justify-center rounded bg-card/70 ring-1 ring-border/50 ring-inset">
					{status.icon}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<Badge size="sm" variant={status.badgeVariant}>
							{status.badgeLabel}
						</Badge>
						<p className="text-muted-foreground text-xs tabular-nums">
							{activity}
						</p>
					</div>
					<h2 className="mt-2 text-balance font-semibold text-base text-foreground">
						{title}
					</h2>
					<p className="mt-1.5 max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed">
						{description}
					</p>
					{permissionDescription ? (
						<p className="mt-1.5 text-pretty text-muted-foreground text-xs">
							{permissionDescription}
						</p>
					) : null}
					{action ? <div className="mt-3">{action}</div> : null}
				</div>
			</Card.Content>
		</Card>
	);
}

const FIRST_REVIEW_CARD_CLASSES = {
	destructive: "border-destructive/30 bg-destructive/5",
	muted: "border-border/70 bg-muted/20",
	primary: "border-primary/20 bg-primary/[0.025]",
	success: "border-success/30 bg-success/5",
	warning: "border-warning/30 bg-warning/5",
} as const;

const FIRST_REVIEW_STATUSES = {
	needs_tracking: {
		action: "tracking",
		badgeLabel: "Tracking needs attention",
		badgeVariant: "warning",
		description:
			"No recent page activity has reached Databuddy, so there is nothing to review yet.",
		icon: (
			<WarningCircleIcon className="size-5 text-warning" weight="duotone" />
		),
		title: "Connect tracking before your first review",
	},
	collecting_baseline: {
		action: null,
		badgeLabel: "Collecting baseline",
		badgeVariant: "muted",
		description: "",
		icon: <ClockIcon className="size-5 text-warning" weight="duotone" />,
		title: "Tracking is working; your first trend review is next",
	},
	ready: {
		action: "review",
		badgeLabel: "Ready",
		badgeVariant: "success",
		description:
			"Run one review of this site. You will see a specific finding—or a clear no-finding result.",
		icon: <LightbulbIcon className="size-5 text-success" weight="duotone" />,
		title: "Your first review is ready",
	},
	running: {
		action: null,
		badgeLabel: "Review in progress",
		badgeVariant: "primary",
		description: "Checking this site for a decision-worthy finding.",
		icon: (
			<CircleNotchIcon
				className="size-5 animate-spin text-primary"
				weight="duotone"
			/>
		),
		title: "Looking for one thing worth acting on",
	},
	waiting_for_organization_run: {
		action: null,
		badgeLabel: "Analysis in progress",
		badgeVariant: "warning",
		description:
			"Databuddy runs one organization analysis at a time. Start this review when it finishes.",
		icon: <ClockIcon className="size-5 text-warning" weight="duotone" />,
		title: "Another site is being reviewed",
	},
	needs_credits: {
		action: "review",
		badgeLabel: "Needs credits",
		badgeVariant: "warning",
		description:
			"No investigation credits were available for the last attempt. Add credits, then retry.",
		icon: <CoinsIcon className="size-5 text-warning" weight="duotone" />,
		title: "Your first review is waiting for credits",
	},
	deferred: {
		action: null,
		badgeLabel: "Still watching",
		badgeVariant: "warning",
		description:
			"Databuddy found a change, but needs another comparison window before it can make a recommendation.",
		icon: <ClockIcon className="size-5 text-warning" weight="duotone" />,
		title: "This needs more evidence",
	},
	no_findings: {
		action: null,
		badgeLabel: "First review complete",
		badgeVariant: "success",
		description: "",
		icon: <CheckCircleIcon className="size-5 text-success" weight="duotone" />,
		title: "",
	},
	needs_attention: {
		action: "review",
		badgeLabel: "Needs retry",
		badgeVariant: "destructive",
		description:
			"The last attempt did not finish. Retrying runs this site only.",
		icon: (
			<WarningCircleIcon className="size-5 text-destructive" weight="duotone" />
		),
		title: "Your first review needs another try",
	},
	reviewed: {
		action: null,
		badgeLabel: "First review complete",
		badgeVariant: "success",
		description: "",
		icon: <CheckCircleIcon className="size-5 text-success" weight="duotone" />,
		title: "",
	},
} as const satisfies Record<
	FirstReviewState,
	{
		action: "review" | "tracking" | null;
		badgeLabel: string;
		badgeVariant: keyof typeof FIRST_REVIEW_CARD_CLASSES;
		description: string;
		icon: ReactNode;
		title: string;
	}
>;

function isFirstReviewActive(state: FirstReviewState | undefined) {
	return state === "running" || state === "waiting_for_organization_run";
}

function isFirstReviewStatusActive(state: string | undefined) {
	return state === "running" || state === "waiting_for_organization_run";
}

function isFirstReviewComplete(state: FirstReviewState | undefined) {
	return state === "reviewed" || state === "no_findings";
}

function formatFirstReviewActivity(
	activity: FirstReviewReadiness["activity"]
): string {
	return `${activity.sessions.toLocaleString("en-US")} session${activity.sessions === 1 ? "" : "s"} · ${activity.pageviews.toLocaleString("en-US")} pageview${activity.pageviews === 1 ? "" : "s"} · ${activity.activeDays.toLocaleString("en-US")} active day${activity.activeDays === 1 ? "" : "s"}`;
}

function formatFirstReviewDate(value: string) {
	return PERIOD_DATE_FORMATTER.format(new Date(value));
}

function InsightBrief({
	description,
	emptyDescription,
	emptyTitle,
	hasNextPage,
	insights,
	isFetchingNextPage,
	onLoadMoreAction,
	onRetryAction,
	state,
	title,
}: {
	description: string;
	emptyDescription?: string;
	emptyTitle?: string;
	hasNextPage: boolean;
	insights: BriefInsight[];
	isFetchingNextPage: boolean;
	onLoadMoreAction: () => void;
	onRetryAction: () => void;
	state: "error" | "loading" | "ready";
	title: string;
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
					description={
						emptyDescription ??
						"Noteworthy changes, improvements, and recoveries will appear here."
					}
					icon={<LightbulbIcon weight="duotone" />}
					title={emptyTitle ?? "No insights yet"}
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
		<Card aria-label={title} className="border-border/70 shadow-sm">
			<Card.Header className="border-b bg-card px-5 py-4 sm:px-6">
				<Card.Title>{title}</Card.Title>
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
