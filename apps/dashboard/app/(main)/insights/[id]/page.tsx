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
	Badge,
	Button,
	Card,
	dayjs,
	EmptyState,
	Field,
	formatDateTime,
	fromNow,
	Skeleton,
	Spinner,
	Textarea,
} from "@databuddy/ui";

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

	return (
		<div className="flex h-full flex-col overflow-y-auto">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Investigation</h1>
			</TopBar.Title>

			<div className="mx-auto w-full max-w-4xl space-y-4 p-4 sm:p-5">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					href="/insights"
				>
					<ArrowLeftIcon className="size-3.5 shrink-0" />
					All investigations
				</Link>

				{isLoading && (
					<Card aria-label="Investigation">
						<div className="space-y-3 p-5">
							<Skeleton className="h-5 w-2/3 rounded" />
							<Skeleton className="h-4 w-full rounded" />
							<Skeleton className="h-4 w-4/5 rounded" />
						</div>
					</Card>
				)}

				{!isLoading && insight && (
					<Card aria-label="Investigation">
						<header className="space-y-2 border-b px-5 py-4">
							<div className="flex items-center justify-between gap-3">
								<p className="font-medium text-muted-foreground text-xs">
									{insight.websiteName ?? insight.websiteDomain}
								</p>
								<Badge
									size="sm"
									variant={
										insight.status === "resolved" ? "success" : "warning"
									}
								>
									{insight.status === "resolved" ? "Resolved" : "Open"}
								</Badge>
							</div>
							<h2 className="font-semibold text-base text-foreground">
								{insight.title}
							</h2>
						</header>
						<CaseActivity
							canReply={data?.canReply ?? false}
							insightId={insight.id}
							items={data?.timeline ?? []}
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
						title="Investigation not available"
						variant="minimal"
					/>
				)}
			</div>
		</div>
	);
}

function CaseActivity({
	canReply,
	insightId,
	items,
}: {
	canReply: boolean;
	insightId: string;
	items: TimelineItem[];
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

	return (
		<section aria-labelledby="case-activity-title">
			<div className="border-b bg-muted/40 px-5 py-4">
				<h2
					className="font-semibold text-foreground text-sm"
					id="case-activity-title"
				>
					Activity
				</h2>
				<p className="mt-1 text-muted-foreground text-xs">
					Investigation history and context from your team.
				</p>
			</div>

			<ol>
				{items.map((item, index) => (
					<TimelineEntry
						isLast={index === items.length - 1}
						item={item}
						key={`${item.kind}-${item.id}`}
						onRetry={
							canReply && !active && item.id === latestReplyId
								? (replyId) => retry.mutate({ replyId })
								: undefined
						}
						retrying={retry.isPending && retry.variables.replyId === item.id}
					/>
				))}
			</ol>

			{canReply && <ReplyComposer disabled={active} insightId={insightId} />}
		</section>
	);
}

function TimelineEntry({
	isLast,
	item,
	onRetry,
	retrying,
}: {
	isLast: boolean;
	item: TimelineItem;
	onRetry?: (replyId: string) => void;
	retrying: boolean;
}) {
	return (
		<li className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 px-5 py-4">
			<div className="relative">
				{!isLast && (
					<span className="absolute top-7 bottom-[-1rem] left-1/2 w-px -translate-x-1/2 bg-border" />
				)}
				{item.kind === "reply" ? (
					<span className="flex size-6 items-center justify-center rounded-full bg-secondary text-muted-foreground">
						<UserIcon className="size-3.5" weight="duotone" />
					</span>
				) : (
					<span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
						<RobotIcon className="size-3.5" weight="duotone" />
					</span>
				)}
			</div>

			<article className="min-w-0 space-y-3">
				<div className="flex flex-wrap items-center gap-2">
					<div className="flex min-w-0 items-center gap-2 text-xs">
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
				</div>
				{item.kind === "reply" ? (
					<>
						<p className="whitespace-pre-wrap text-[13px] text-foreground/85 leading-relaxed">
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
					<InvestigationActivity item={item} />
				)}
			</article>
		</li>
	);
}

function InvestigationActivity({ item }: { item: InvestigationItem }) {
	const { outcome } = item;

	return (
		<div className="space-y-3">
			<p className="text-[11px] text-muted-foreground">
				Signal window {formatPeriod(item.period.current)} against{" "}
				{formatPeriod(item.period.previous)}
			</p>

			<div>
				<h3 className="font-medium text-[13px] text-foreground">
					{outcome.title}
				</h3>
				<p className="mt-1 text-[13px] text-foreground/80 leading-relaxed">
					{outcome.summary}
				</p>
			</div>

			{(outcome.impact || outcome.rootCause) && (
				<dl className="grid gap-3 sm:grid-cols-2">
					{outcome.impact && (
						<div>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								Impact
							</dt>
							<dd className="mt-1 text-foreground/80 text-xs leading-relaxed">
								{outcome.impact}
							</dd>
						</div>
					)}
					{outcome.rootCause && (
						<div>
							<dt className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
								Cause
							</dt>
							<dd className="mt-1 text-foreground/80 text-xs leading-relaxed">
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
							className="flex gap-2 text-muted-foreground text-xs leading-relaxed"
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

			<NextStep next={outcome.next} />
		</div>
	);
}

function NextStep({ next }: { next: InvestigationNext }) {
	const copy = nextCopy(next);
	return (
		<div className="rounded-md border border-border/60 bg-accent/30 px-3 py-2.5">
			<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
				{copy.label}
			</p>
			<p className="mt-1 text-foreground/85 text-xs leading-relaxed">
				{copy.body}
			</p>
			{copy.detail && (
				<p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
					{copy.detail}
				</p>
			)}
		</div>
	);
}

function ReplyComposer({
	disabled,
	insightId,
}: {
	disabled: boolean;
	insightId: string;
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
		replyMutation.mutate({ body: trimmed, insightId });
	};

	return (
		<form className="border-t bg-muted/20 px-5 py-4" onSubmit={submitReply}>
			<Field>
				<Field.Label>Add context</Field.Label>
				<Textarea
					disabled={disabled}
					maxLength={2000}
					maxRows={8}
					minRows={3}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Add context, a correction, or what changed…"
					value={body}
				/>
				<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<Field.Description>
						{disabled
							? "Wait for the current check to finish."
							: "Databuddy will verify it against current data."}
					</Field.Description>
					<Button
						disabled={disabled || !body.trim() || replyMutation.isPending}
						loading={replyMutation.isPending}
						size="sm"
						type="submit"
					>
						<PaperPlaneIcon className="size-3.5" weight="bold" />
						Re-check case
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
				detail: `Target: ${next.target} · Owner: ${next.owner} · Verify: ${next.verification}`,
				label: "Next action",
			};
		case "ask":
			return {
				body: next.question,
				detail: `Ask: ${next.who} · ${next.why}`,
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
