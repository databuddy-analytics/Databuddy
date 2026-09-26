"use client";

import { isSelfHosted } from "@databuddy/env/public";

import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { TopBar } from "@/components/layout/top-bar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { MessageResponse } from "@/components/ai-elements/message";
import { insightQueries, type InsightByIdResponse } from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import {
	ArrowLeftIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	CopyIcon,
	GlobeIcon,
	LightbulbIcon,
	LinkBreakIcon,
	LinkIcon,
	PaperPlaneIcon,
	RobotIcon,
	ShareNetworkIcon,
	UserIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";
import {
	Button,
	buttonVariants,
	Card,
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
	CaseState,
	InvestigationActivity,
} from "../_components/investigation-row";

type TimelineItem = InsightByIdResponse["timeline"][number];
type InvestigationItem = Extract<TimelineItem, { kind: "investigation" }>;

export default function InsightDetailPage() {
	const params = useParams();
	const router = useRouter();
	const insightId = typeof params.id === "string" ? params.id : "";
	const [replyOpen, setReplyOpen] = useState(false);

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
			{insight ? (
				<TopBar.Actions>
					<ShareMenu
						insightId={insight.id}
						latestFindingAt={latest?.createdAt ?? null}
					/>
				</TopBar.Actions>
			) : null}

			<div className="mx-auto w-full max-w-4xl space-y-3 px-3 pt-3 pb-20 sm:space-y-4 sm:p-5">
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
					href="/insights/investigations"
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
								{latest?.entity.label ?? insight.title}
							</h2>
						</header>
						<CaseState items={data?.timeline ?? []} latest={latest ?? null} />
						<CaseActivity
							canReply={data?.canReply ?? false}
							insightId={insight.id}
							isResolved={insight.status === "resolved"}
							items={data?.timeline ?? []}
							replyOpen={replyOpen}
							onReplyOpenChange={setReplyOpen}
							websiteId={insight.websiteId}
						/>
					</Card>
				)}

				{!(isLoading || insight) && (
					<EmptyState
						action={{
							label: "All investigations",
							onClick: () => router.push("/insights/investigations"),
						}}
						description={
							isError
								? "This investigation is unavailable, or it belongs to a workspace you can't access."
								: "This investigation no longer exists."
						}
						icon={<LightbulbIcon />}
						className="min-h-[50dvh]"
						title="Investigation not available"
						variant="minimal"
					/>
				)}
			</div>
		</div>
	);
}

function ShareMenu({
	insightId,
	latestFindingAt,
}: {
	insightId: string;
	latestFindingAt: string | null;
}) {
	const queryClient = useQueryClient();
	const { copyToClipboard } = useCopyToClipboard();
	const shareInput = { input: { insightId } };
	const { data, isPending } = useQuery(
		orpc.insights.getShare.queryOptions(shareInput)
	);
	const share = data?.share ?? null;
	const canPublish = data?.canPublish ?? false;
	const publicUrl = (shareId: string) =>
		`${window.location.origin}/public/investigations/${shareId}`;
	const refreshShare = () =>
		queryClient.invalidateQueries({
			queryKey: orpc.insights.getShare.key(shareInput),
		});

	const publish = useMutation({
		...orpc.insights.publishShare.mutationOptions(),
		onError: (error) => {
			toast.error(error instanceof Error ? error.message : "Could not publish");
		},
		onSuccess: (published) => {
			refreshShare();
			copyToClipboard(publicUrl(published.id));
			toast.success(
				published.version === 1
					? "Public link copied"
					: `Version ${published.version} published`,
				{
					description:
						"Anyone with the link sees this version until you publish again.",
				}
			);
		},
	});
	const unpublish = useMutation({
		...orpc.insights.unpublishShare.mutationOptions(),
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Could not turn off the link"
			);
		},
		onSuccess: () => {
			refreshShare();
			toast.success("Public link turned off");
		},
	});
	const busy = publish.isPending || unpublish.isPending;
	const hasUnpublishedFindings = Boolean(
		share && latestFindingAt && latestFindingAt > share.publishedAt
	);

	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				className={buttonVariants({ size: "sm", variant: "secondary" })}
			>
				<ShareNetworkIcon className="size-4" />
				Share
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" className="w-64">
				<DropdownMenu.Item
					onClick={() => {
						copyToClipboard(window.location.href);
						toast.success("Link copied", {
							description: "Members of your organization can open it.",
						});
					}}
				>
					<LinkIcon className="size-3.5" />
					Copy link for your team
				</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.GroupLabel>
						{share
							? `Public · V${share.version} published ${formatDateTime(share.publishedAt)}`
							: "Public link off"}
					</DropdownMenu.GroupLabel>
					{share ? (
						<>
							<DropdownMenu.Item
								onClick={() => {
									copyToClipboard(publicUrl(share.id));
									toast.success("Public link copied");
								}}
							>
								<CopyIcon className="size-3.5" />
								Copy public link
							</DropdownMenu.Item>
							<DropdownMenu.Item
								onClick={() =>
									window.open(publicUrl(share.id), "_blank", "noopener")
								}
							>
								<ArrowSquareOutIcon className="size-3.5" />
								View as a visitor
							</DropdownMenu.Item>
							{canPublish ? (
								<>
									<DropdownMenu.Item
										disabled={busy}
										onClick={() => publish.mutate({ insightId })}
									>
										<GlobeIcon className="size-3.5" />
										{hasUnpublishedFindings
											? "Publish new findings"
											: "Publish new version"}
									</DropdownMenu.Item>
									<DropdownMenu.Item
										disabled={busy}
										onClick={() => unpublish.mutate({ insightId })}
										variant="destructive"
									>
										<LinkBreakIcon className="size-3.5" />
										Turn off public link
									</DropdownMenu.Item>
								</>
							) : null}
						</>
					) : (
						<DropdownMenu.Item
							disabled={isPending || busy || !canPublish}
							onClick={() => publish.mutate({ insightId })}
						>
							<GlobeIcon className="size-3.5" />
							{canPublish || isPending
								? "Publish a public link"
								: "Editors can publish a public link"}
						</DropdownMenu.Item>
					)}
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function CaseActivity({
	canReply,
	insightId,
	isResolved,
	items,
	onReplyOpenChange,
	replyOpen,
	websiteId,
}: {
	canReply: boolean;
	insightId: string;
	isResolved: boolean;
	items: TimelineItem[];
	onReplyOpenChange: (open: boolean) => void;
	replyOpen: boolean;
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
						/>
					</Button>
				</div>
			) : null}

			{canReply && (
				<ContextReply
					disabled={active}
					insightId={insightId}
					onOpenChange={onReplyOpenChange}
					open={replyOpen}
				/>
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
							<UserIcon className="size-3" />
						</span>
					) : (
						<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
							<RobotIcon className="size-3" />
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
						{item.assistantText && (
							<div className="space-y-1 border-t pt-3">
								<p className="font-medium text-xs">Databuddy</p>
								<MessageResponse
									className="text-sm leading-relaxed"
									mode="static"
								>
									{item.assistantText}
								</MessageResponse>
							</div>
						)}
						{(item.status === "queued" || item.status === "running") && (
							<p className="flex items-center gap-2 text-muted-foreground text-xs">
								<Spinner size="sm" />
								{item.status === "queued"
									? "Reply queued…"
									: item.intent === "clarification"
										? "Databuddy is answering…"
										: "Databuddy is investigating…"}
							</p>
						)}
						{item.status === "failed" && (
							<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
								<span>Reply failed.</span>
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

function ContextReply({
	disabled,
	insightId,
	onOpenChange,
	open,
}: {
	disabled: boolean;
	insightId: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	if (!open) {
		return (
			<div className="border-t px-4 py-2 sm:px-5" id="context-reply">
				<Button
					disabled={disabled}
					onClick={() => onOpenChange(true)}
					size="sm"
					type="button"
					variant="ghost"
				>
					Ask about this investigation
				</Button>
			</div>
		);
	}

	return (
		<ReplyComposer
			disabled={disabled}
			insightId={insightId}
			onClose={() => onOpenChange(false)}
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
		sendReply(trimmed, "Databuddy is answering your clarification");
	};
	const sendReply = (
		message: string,
		successMessage: string,
		intent: "clarification" | "analysis" = "clarification"
	) => {
		if (disabled || replyMutation.isPending) {
			return;
		}
		replyMutation.mutate(
			{
				body: message,
				insightId,
				intent,
				...(intent === "analysis"
					? { acceptedPriceUsd: INVESTIGATION_USAGE.priceUsd }
					: {}),
			},
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
				<Field.Label className="sr-only">Question</Field.Label>
				<Textarea
					disabled={disabled}
					maxLength={2000}
					maxRows={8}
					minRows={2}
					onChange={(event) => setBody(event.target.value)}
					placeholder="Ask about this result, or write a new question…"
					value={body}
				/>
				<p className="text-pretty text-muted-foreground text-xs">
					{isSelfHosted
						? "Ask a follow-up question or start a new investigation."
						: "Clarifications are included. New investigations use your allowance, then cost $1 each."}
				</p>
				<div className="flex flex-wrap justify-end gap-2">
					<Button
						disabled={disabled || !body.trim() || replyMutation.isPending}
						onClick={() =>
							sendReply(body.trim(), "New analysis queued", "analysis")
						}
						size="sm"
						type="button"
						variant="secondary"
					>
						New analysis · 1 investigation
					</Button>
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
						<PaperPlaneIcon className="size-3.5" />
						Send clarification
					</Button>
				</div>
			</Field>
		</form>
	);
}
