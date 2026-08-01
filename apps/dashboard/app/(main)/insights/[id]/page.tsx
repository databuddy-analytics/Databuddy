"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { insightQueries, type InsightByIdResponse } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	LightbulbIcon,
	PaperPlaneIcon,
	RobotIcon,
	UserIcon,
} from "@databuddy/ui/icons";
import {
	Button,
	Card,
	dayjs,
	EmptyState,
	Field,
	formatDateTime,
	fromNow,
	Skeleton,
	Spinner,
	StatusDot,
	Textarea,
} from "@databuddy/ui";
import {
	ExecuteGoalAction,
	GoalRecommendationAction,
} from "../_components/investigation-row";
import {
	ConversionDraftRecommendationAction,
	InstrumentationRecommendationDetails,
} from "../_components/conversion-draft-recommendation";
import {
	isConversionDraftRecommendation,
	isGoalRecommendation,
	isInstrumentationRecommendation,
} from "../_components/recommendation-guards";

type TimelineItem = InsightByIdResponse["timeline"][number];
type InvestigationItem = Extract<TimelineItem, { kind: "investigation" }>;
type InvestigationNext = InvestigationItem["outcome"]["next"];

export default function InsightDetailPage() {
	const params = useParams();
	const router = useRouter();
	const insightId = typeof params.id === "string" ? params.id : "";

	const { data, isLoading, isError } = useQuery({
		...insightQueries.byId(insightId || undefined),
		refetchInterval: (query) =>
			query.state.data?.timeline.some(
				(item) =>
					item.kind === "reply" &&
					(item.status === "queued" || item.status === "running")
			)
				? 2000
				: false,
	});

	const insight = data?.insight ?? null;
	const latest = data?.timeline.findLast(
		(item): item is InvestigationItem => item.kind === "investigation"
	);

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Investigation</h1>
			</TopBar.Title>

			<div className="mx-auto w-full max-w-2xl space-y-3 px-3 pt-3 pb-20 sm:space-y-4 sm:p-5">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					href="/insights"
				>
					<ArrowLeftIcon className="size-3.5 shrink-0" />
					All investigations
				</Link>

				{isLoading && (
					<Card aria-label="Investigation">
						<div className="space-y-3 p-4 sm:p-5">
							<Skeleton className="h-5 w-2/3 rounded" />
							<Skeleton className="h-4 w-full rounded" />
							<Skeleton className="h-4 w-4/5 rounded" />
						</div>
					</Card>
				)}

				{!isLoading && insight && (
					<Card aria-label="Investigation">
						<header className="space-y-2 border-b px-4 py-4 sm:px-5">
							<div className="flex items-center justify-between gap-3">
								<p className="truncate font-medium text-muted-foreground text-xs">
									{insight.websiteName ?? insight.websiteDomain}
								</p>
								<span className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs">
									<StatusDot
										color={
											insight.status === "resolved" ? "success" : "warning"
										}
									/>
									{insight.status === "resolved" ? "Resolved" : "Open"}
								</span>
							</div>
							<h2 className="text-pretty font-semibold text-base text-foreground leading-snug sm:text-lg">
								{latest?.subject ?? insight.title}
							</h2>
						</header>
						<CaseState items={data?.timeline ?? []} latest={latest ?? null} />
						<CaseActivity
							canReply={data?.canReply ?? false}
							insightId={insight.id}
							isResolved={insight.status === "resolved"}
							items={data?.timeline ?? []}
							websiteId={insight.websiteId}
						/>
					</Card>
				)}

				{!(isLoading || insight) && (
					<EmptyState
						action={{
							label: "All investigations",
							onClick: () => router.push("/insights"),
						}}
						description={
							isError
								? "This investigation is unavailable, or it belongs to a workspace you can't access."
								: "This investigation no longer exists."
						}
						icon={<LightbulbIcon weight="duotone" />}
						className="min-h-[50dvh]"
						title="Investigation not available"
						variant="minimal"
					/>
				)}
			</div>
		</div>
	);
}

function CaseState({
	items,
	latest,
}: {
	items: TimelineItem[];
	latest: InvestigationItem | null;
}) {
	if (!latest) {
		return null;
	}
	const reported = items.findLast(
		(item): item is Extract<TimelineItem, { kind: "reply" }> =>
			item.kind === "reply"
	);
	const verifying =
		reported &&
		reported.status !== "failed" &&
		reported.createdAt > latest.createdAt;
	const copy = verifying
		? {
				body:
					latest.outcome.next.type === "act"
						? latest.outcome.next.verification
						: "Databuddy is checking the latest context.",
				label: "Measuring",
			}
		: nextCopy(latest.outcome.next);

	return (
		<section
			className="border-b bg-muted/20 px-4 py-4 sm:px-5"
			aria-label="Current state"
		>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						{copy.label}
					</p>
					{"body" in copy ? (
						<p className="mt-1 text-foreground text-sm leading-relaxed">
							{copy.body}
						</p>
					) : null}
					{"detail" in copy && copy.detail ? (
						<p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
							{copy.detail}
						</p>
					) : null}
				</div>
				<StatusDot
					color={
						verifying
							? "warning"
							: latest.outcome.next.type === "resolve"
								? "success"
								: "warning"
					}
				/>
			</div>
		</section>
	);
}

function CaseActivity({
	canReply,
	insightId,
	isResolved,
	items,
	websiteId,
}: {
	canReply: boolean;
	insightId: string;
	isResolved: boolean;
	items: TimelineItem[];
	websiteId: string;
}) {
	const queryClient = useQueryClient();
	const retry = useMutation({
		...orpc.insights.retryReply.mutationOptions(),
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Could not retry");
		},
		onSuccess: (result) => {
			queryClient.invalidateQueries({
				queryKey: insightQueries.all(),
			});
			if (result.status === "failed") {
				toast.error(
					"The reply was saved, but the investigation could not start"
				);
			} else {
				toast.success("Investigation resumed");
			}
		},
	});
	const active =
		retry.isPending ||
		items.some(
			(item) =>
				item.kind === "reply" &&
				(item.status === "queued" || item.status === "running")
		);
	const latestReplyId = items.findLast((item) => item.kind === "reply")?.id;
	const latestInvestigationId = items.findLast(
		(item): item is InvestigationItem => item.kind === "investigation"
	)?.id;
	const settled = active || isResolved;
	const [historyExpanded, setHistoryExpanded] = useState(false);
	const visibleItems = settled && !historyExpanded ? items.slice(-1) : items;

	return (
		<section aria-label="Investigation activity">
			<ol className="divide-y">
				{visibleItems.map((item) => (
					<TimelineEntry
						collapseEvidence={
							settled &&
							item.kind === "investigation" &&
							item.id === latestInvestigationId
						}
						item={item}
						insightId={
							item.kind === "investigation" && item.id === latestInvestigationId
								? insightId
								: null
						}
						key={`${item.kind}-${item.id}`}
						onRetry={
							canReply && !active && item.id === latestReplyId
								? (replyId) => retry.mutate({ replyId })
								: undefined
						}
						retrying={retry.isPending && retry.variables.replyId === item.id}
						websiteId={websiteId}
					/>
				))}
			</ol>
			{settled && items.length > 1 ? (
				<div className="border-t px-4 py-2 sm:px-5">
					<Button
						onClick={() => setHistoryExpanded((expanded) => !expanded)}
						size="sm"
						type="button"
						variant="ghost"
					>
						{historyExpanded
							? "Hide earlier updates"
							: `Show ${items.length - 1} earlier update${items.length === 2 ? "" : "s"}`}
						<CaretDownIcon
							className={historyExpanded ? "rotate-180" : undefined}
							weight="bold"
						/>
					</Button>
				</div>
			) : null}

			{canReply && !isResolved && (
				<ContextReply disabled={active} insightId={insightId} />
			)}
		</section>
	);
}

function TimelineEntry({
	collapseEvidence,
	insightId,
	item,
	onRetry,
	retrying,
	websiteId,
}: {
	collapseEvidence: boolean;
	insightId: string | null;
	item: TimelineItem;
	onRetry?: (replyId: string) => void;
	retrying: boolean;
	websiteId: string;
}) {
	return (
		<li
			className={
				item.kind === "reply"
					? "bg-muted/30 px-4 py-4 sm:px-5"
					: "px-4 py-4 sm:px-5"
			}
		>
			<article className="min-w-0 space-y-3">
				<header className="flex min-w-0 items-center gap-2 text-xs">
					{item.kind === "reply" ? (
						<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
							<UserIcon className="size-3" weight="duotone" />
						</span>
					) : (
						<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<RobotIcon className="size-3" weight="duotone" />
						</span>
					)}
					<div className="flex min-w-0 items-center gap-2">
						<span className="truncate font-medium text-foreground">
							{item.kind === "reply" ? item.author : "Databuddy"}
						</span>
						<span aria-hidden className="text-muted-foreground/50">
							·
						</span>
						<time
							className="shrink-0 text-[11px] text-muted-foreground"
							dateTime={item.createdAt}
							suppressHydrationWarning
							title={formatDateTime(item.createdAt)}
						>
							{fromNow(item.createdAt)}
						</time>
					</div>
				</header>
				{item.kind === "reply" ? (
					<>
						<p className="whitespace-pre-wrap text-foreground/85 text-sm leading-relaxed">
							{item.body}
						</p>
						{(item.status === "queued" || item.status === "running") && (
							<p className="flex items-center gap-2 text-muted-foreground text-xs">
								<Spinner size="sm" />
								{item.status === "queued"
									? "Queued for investigation…"
									: "Databuddy is investigating…"}
							</p>
						)}
						{item.status === "failed" && (
							<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<span>Investigation failed.</span>
								{onRetry && (
									<Button
										disabled={retrying}
										loading={retrying}
										onClick={() => onRetry(item.id)}
										size="sm"
										variant="secondary"
									>
										Retry
									</Button>
								)}
							</div>
						)}
					</>
				) : (
					<InvestigationActivity
						collapseEvidence={collapseEvidence}
						insightId={insightId}
						item={item}
						websiteId={websiteId}
					/>
				)}
			</article>
		</li>
	);
}

function InvestigationActivity({
	collapseEvidence,
	insightId,
	item,
	websiteId,
}: {
	collapseEvidence: boolean;
	insightId: string | null;
	item: InvestigationItem;
	websiteId: string;
}) {
	const { outcome } = item;
	const sourceHref = investigationSourceHref(item, websiteId);
	const recommendation = outcome.recommendation;
	const execution =
		outcome.next.type === "act" ? outcome.next.execution : undefined;

	return (
		<div className="space-y-3">
			<div className="text-muted-foreground text-xs">
				<p>
					{formatPeriod(item.period.current)} compared with{" "}
					{formatPeriod(item.period.previous)}
				</p>
			</div>

			<div>
				<h3 className="text-pretty font-medium text-foreground text-sm leading-snug">
					{outcome.title}
				</h3>
			</div>

			<dl className="grid gap-3 sm:grid-cols-2">
				<div className="sm:col-span-2">
					<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						What happened
					</dt>
					<dd className="mt-1 text-foreground/80 text-sm leading-relaxed">
						{outcome.summary}
					</dd>
				</div>
				{outcome.impact && (
					<div>
						<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							Why it matters
						</dt>
						<dd className="mt-1 text-foreground/80 text-sm leading-relaxed">
							{outcome.impact}
						</dd>
					</div>
				)}
				{outcome.rootCause && (
					<div>
						<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
							Why it happened
						</dt>
						<dd className="mt-1 text-foreground/80 text-sm leading-relaxed">
							{outcome.rootCause}
						</dd>
					</div>
				)}
			</dl>

			<Evidence
				evidence={outcome.evidence}
				initiallyCollapsed={collapseEvidence}
				sourceHref={sourceHref}
			/>

			{recommendation ? (
				<div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-3">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						Recommended
					</p>
					<p className="mt-1 font-medium text-foreground/85 text-sm leading-relaxed">
						{recommendation.action}
					</p>
					{isInstrumentationRecommendation(recommendation) ? (
						<InstrumentationRecommendationDetails
							recommendation={recommendation}
						/>
					) : null}
					{isConversionDraftRecommendation(recommendation) ? (
						<div className="mt-2 flex flex-wrap gap-1.5">
							<ConversionDraftRecommendationAction
								recommendation={recommendation}
								websiteId={websiteId}
							/>
						</div>
					) : item.entity.type === "goal" &&
						isGoalRecommendation(recommendation) ? (
						<div className="mt-2 flex flex-wrap gap-1.5">
							<GoalRecommendationAction
								goalId={item.entity.id}
								recommendation={recommendation}
								websiteId={websiteId}
							/>
						</div>
					) : null}
				</div>
			) : null}

			{outcome.next.type !== "resolve" || !outcome.recommendation ? (
				<NextStep
					hideAction={Boolean(execution?.operation)}
					next={outcome.next}
				/>
			) : null}

			{insightId && execution?.operation ? (
				<div className="flex flex-wrap">
					<ExecuteGoalAction execution={execution} insightId={insightId} />
				</div>
			) : null}
		</div>
	);
}

function Evidence({
	evidence,
	initiallyCollapsed,
	sourceHref,
}: {
	evidence: string[];
	initiallyCollapsed: boolean;
	sourceHref: string | null;
}) {
	const [expanded, setExpanded] = useState(!initiallyCollapsed);
	const evidenceId = useId();

	return (
		<div>
			<div className="flex items-center justify-between gap-3">
				<Button
					aria-controls={evidenceId}
					aria-expanded={expanded}
					onClick={() => setExpanded((open) => !open)}
					size="sm"
					type="button"
					variant="ghost"
				>
					Evidence
					<CaretDownIcon
						aria-hidden
						className={expanded ? "rotate-180" : undefined}
						weight="bold"
					/>
				</Button>
				{sourceHref ? (
					<Link
						className="inline-flex items-center gap-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
						href={sourceHref}
					>
						View source
						<ArrowSquareOutIcon aria-hidden className="size-3" />
					</Link>
				) : null}
			</div>
			{expanded ? (
				<ul className="mt-1 space-y-1" id={evidenceId}>
					{evidence.map((entry) => (
						<li
							className="flex gap-2 text-muted-foreground text-sm leading-relaxed"
							key={entry}
						>
							<span aria-hidden className="text-muted-foreground/50">
								•
							</span>
							<span>{entry}</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

function investigationSourceHref(
	item: InvestigationItem,
	websiteId: string
): string {
	const base = `/websites/${encodeURIComponent(websiteId)}`;
	switch (item.entity.type) {
		case "event":
			return `${base}/events/${encodeURIComponent(item.entity.id)}`;
		case "error":
			return `${base}/errors`;
		case "funnel":
		case "funnel_step":
			return `${base}/funnels`;
		case "goal":
			return `${base}/goals`;
		case "vital":
			return `${base}/vitals`;
		default:
			return base;
	}
}

function NextStep({
	hideAction,
	next,
}: {
	hideAction: boolean;
	next: InvestigationNext;
}) {
	const copy = nextCopy(next);
	return (
		<div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-3">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
				{copy.label}
			</p>
			{!hideAction || next.type !== "act" ? (
				<p className="mt-1 font-medium text-foreground/85 text-sm leading-relaxed">
					{copy.body}
				</p>
			) : null}
			{copy.detail && (
				<p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
					{copy.detail}
				</p>
			)}
		</div>
	);
}

function ContextReply({
	disabled,
	insightId,
}: {
	disabled: boolean;
	insightId: string;
}) {
	const [open, setOpen] = useState(false);

	if (!open) {
		return (
			<div className="border-t px-4 py-2 sm:px-5">
				<Button
					disabled={disabled}
					onClick={() => setOpen(true)}
					size="sm"
					type="button"
					variant="ghost"
				>
					Add context
				</Button>
			</div>
		);
	}

	return (
		<ReplyComposer
			disabled={disabled}
			insightId={insightId}
			onClose={() => setOpen(false)}
		/>
	);
}

function ReplyComposer({
	disabled,
	insightId,
	onClose,
}: {
	disabled: boolean;
	insightId: string;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const [body, setBody] = useState("");
	const replyMutation = useMutation({
		...orpc.insights.reply.mutationOptions(),
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not add reply"
			);
		},
		onSuccess: (data) => {
			setBody("");
			onClose();
			queryClient.invalidateQueries({
				queryKey: insightQueries.all(),
			});
			if (data.reply.status === "failed") {
				toast.error("Reply saved, but the investigation could not start");
			}
		},
	});

	const submitReply = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = body.trim();
		if (!trimmed) {
			return;
		}
		sendReply(trimmed, "Databuddy is checking the latest context");
	};
	const sendReply = (message: string, successMessage: string) => {
		if (disabled || replyMutation.isPending) {
			return;
		}
		replyMutation.mutate(
			{ body: message, insightId },
			{
				onSuccess: (data) => {
					if (data.reply.status !== "failed") {
						toast.success(successMessage);
					}
				},
			}
		);
	};
	return (
		<form className="border-t px-4 py-4 sm:px-5" onSubmit={submitReply}>
			<Field>
				<Field.Label className="sr-only">Add context</Field.Label>
				<Textarea
					disabled={disabled}
					maxLength={2000}
					maxRows={8}
					minRows={2}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Add context, a correction, or what changed…"
					value={body}
				/>
				<div className="flex justify-end gap-2">
					<Button
						disabled={replyMutation.isPending}
						onClick={onClose}
						size="sm"
						type="button"
						variant="ghost"
					>
						Cancel
					</Button>
					<Button
						disabled={disabled || !body.trim() || replyMutation.isPending}
						loading={replyMutation.isPending}
						size="sm"
						type="submit"
					>
						<PaperPlaneIcon className="size-3.5" weight="bold" />
						Check latest context
					</Button>
				</div>
			</Field>
		</form>
	);
}

function formatPeriod(period: { from: string; to: string }): string {
	const from = dayjs.utc(period.from).format("MMM D, YYYY");
	const to = dayjs.utc(period.to).format("MMM D, YYYY");
	return from === to ? from : `${from}–${to}`;
}

function nextCopy(next: InvestigationNext): {
	body: string;
	detail?: string;
	label: string;
} {
	switch (next.type) {
		case "act":
			return {
				body: next.action,
				detail: [`Checks: ${next.verification}`, scheduledRecheck(next)]
					.filter(Boolean)
					.join(" · "),
				label: "Needs you",
			};
		case "ask":
			return {
				body: next.question,
				label: "Needs your input",
			};
		case "watch":
			return {
				body: next.escalation,
				detail: scheduledRecheck(next),
				label: "Measuring",
			};
		case "resolve":
			return { body: next.reason, label: "Verified" };
		default:
			throw new Error("Unknown investigation outcome");
	}
}

function scheduledRecheck(
	next: Extract<InvestigationNext, { type: "act" | "watch" }>
): string | undefined {
	if (!next.recheckAt) {
		return;
	}

	return `Databuddy will check again ${dayjs.utc(next.recheckAt).format("MMM D")}`;
}
