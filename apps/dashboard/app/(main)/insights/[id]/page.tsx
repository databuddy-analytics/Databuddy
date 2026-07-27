"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { insightQueries, type InsightByIdResponse } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import {
	ArrowLeftIcon,
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
import { GoalRecommendationAction } from "../_components/investigation-row";

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
				label: "Recheck underway",
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
	items,
	websiteId,
}: {
	canReply: boolean;
	insightId: string;
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
				queryKey: insightQueries.byId(insightId).queryKey,
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
	const latestNext = items.findLast(
		(item): item is InvestigationItem => item.kind === "investigation"
	)?.outcome.next;

	return (
		<section aria-label="Investigation activity">
			<ol className="divide-y">
				{items.map((item) => (
					<TimelineEntry
						item={item}
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

			{canReply && (
				<ReplyComposer
					disabled={active}
					insightId={insightId}
					showActionRecheck={latestNext?.type === "act"}
				/>
			)}
		</section>
	);
}

function TimelineEntry({
	item,
	onRetry,
	retrying,
	websiteId,
}: {
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
					<InvestigationActivity item={item} websiteId={websiteId} />
				)}
			</article>
		</li>
	);
}

function InvestigationActivity({
	item,
	websiteId,
}: {
	item: InvestigationItem;
	websiteId: string;
}) {
	const { outcome } = item;

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
				<p className="mt-1 text-foreground/80 text-sm leading-relaxed">
					{outcome.summary}
				</p>
			</div>

			{outcome.recommendation ? (
				<div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-3">
					<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
						Recommended
					</p>
					<p className="mt-1 font-medium text-foreground/85 text-sm leading-relaxed">
						{outcome.recommendation.action}
					</p>
					{item.entity.type === "goal" && outcome.recommendation.operation ? (
						<div className="mt-2 flex flex-wrap gap-1.5">
							<GoalRecommendationAction
								goalId={item.entity.id}
								recommendation={outcome.recommendation}
								websiteId={websiteId}
							/>
						</div>
					) : null}
				</div>
			) : null}

			{outcome.next.type !== "resolve" || !outcome.recommendation ? (
				<NextStep next={outcome.next} />
			) : null}

			{(outcome.impact || outcome.rootCause) && (
				<dl className="grid gap-3 sm:grid-cols-2">
					{outcome.impact && (
						<div>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								Impact
							</dt>
							<dd className="mt-1 text-foreground/80 text-sm leading-relaxed">
								{outcome.impact}
							</dd>
						</div>
					)}
					{outcome.rootCause && (
						<div>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								Cause
							</dt>
							<dd className="mt-1 text-foreground/80 text-sm leading-relaxed">
								{outcome.rootCause}
							</dd>
						</div>
					)}
				</dl>
			)}

			<div>
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
					Evidence
				</p>
				<ul className="mt-1 space-y-1">
					{outcome.evidence.map((entry) => (
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
			</div>
		</div>
	);
}

function NextStep({ next }: { next: InvestigationNext }) {
	const copy = nextCopy(next);
	return (
		<div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-3">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
				{copy.label}
			</p>
			<p className="mt-1 font-medium text-foreground/85 text-sm leading-relaxed">
				{copy.body}
			</p>
			{copy.detail && (
				<p className="mt-1.5 text-muted-foreground text-xs leading-relaxed">
					{copy.detail}
				</p>
			)}
		</div>
	);
}

function ReplyComposer({
	disabled,
	insightId,
	showActionRecheck,
}: {
	disabled: boolean;
	insightId: string;
	showActionRecheck: boolean;
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
			queryClient.invalidateQueries({
				queryKey: insightQueries.byId(insightId).queryKey,
			});
			if (data.reply.status === "failed") {
				toast.error("Reply saved, but the investigation could not start");
			} else {
				toast.success("Databuddy is investigating your reply");
			}
		},
	});

	const submitReply = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const trimmed = body.trim();
		if (!trimmed) {
			return;
		}
		sendReply(trimmed);
	};
	const sendReply = (message: string) => {
		if (disabled || replyMutation.isPending) {
			return;
		}
		replyMutation.mutate({ body: message, insightId });
	};
	const confirmAction = () => {
		sendReply(
			"I completed the recommended action. Recheck the outcome against current data and its verification condition."
		);
	};
	const markExpected = () =>
		sendReply(
			"This change was expected. Verify whether current evidence supports that explanation and close this investigation if no separate issue remains."
		);

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
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={disabled || replyMutation.isPending}
						onClick={markExpected}
						size="sm"
						type="button"
						variant="secondary"
					>
						This was expected
					</Button>
					{showActionRecheck ? (
						<Button
							disabled={disabled || replyMutation.isPending}
							onClick={confirmAction}
							size="sm"
							type="button"
							variant="secondary"
						>
							I made this change — recheck it
						</Button>
					) : null}
				</div>
				<div className="flex justify-end">
					<Button
						disabled={disabled || !body.trim() || replyMutation.isPending}
						loading={replyMutation.isPending}
						size="sm"
						type="submit"
					>
						<PaperPlaneIcon className="size-3.5" weight="bold" />
						Re-check investigation
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
				detail: `Target: ${next.target} · Done when: ${next.verification}`,
				label: "Next action",
			};
		case "ask":
			return {
				body: next.question,
				label: "Question",
			};
		case "watch":
			return {
				body: next.escalation,
				label: "Watch condition",
			};
		case "resolve":
			return { body: next.reason, label: "Resolved" };
		default:
			throw new Error("Unknown investigation outcome");
	}
}
