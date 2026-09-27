"use client";

import { authClient } from "@databuddy/auth/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	InsightTimelineInvestigation,
	InvestigationOutcome,
} from "@databuddy/shared/insights";
import { Button, dayjs, Skeleton, StatusDot } from "@databuddy/ui";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { List } from "@/components/ui/composables/list";
import {
	insightQueries,
	type Insight,
	type InsightByIdResponse,
} from "@/lib/insight-api";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	ArrowSquareOutIcon,
	CaretDownIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { ContextUsed } from "./context-used";

type TimelineItem = InsightByIdResponse["timeline"][number];
type InvestigationItem = InsightTimelineInvestigation;
type InvestigationNext = InvestigationOutcome["next"];

type DefinitionExecution = Extract<
	NonNullable<
		Extract<InvestigationOutcome["next"], { type: "act" }>["execution"]
	>,
	{ operation: "delete" | "edit" }
>;

export function ExecuteDefinitionAction({
	action,
	execution,
	insightId,
	definitionType,
}: {
	action: string;
	execution: DefinitionExecution;
	definitionType: "funnel" | "goal";
	insightId: string;
}) {
	const queryClient = useQueryClient();
	const memberRole = authClient.useActiveMemberRole();
	const apply = useMutation({
		...orpc.insights.applyAction.mutationOptions(),
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: `Could not apply ${definitionType} action`
			);
		},
		onSuccess: ({ reply }) => {
			queryClient.invalidateQueries({ queryKey: insightQueries.all() });
			queryClient.invalidateQueries({
				queryKey:
					definitionType === "funnel" ? orpc.funnels.key() : orpc.goals.key(),
			});
			const noun = definitionType === "funnel" ? "Funnel" : "Goal";
			toast.success(
				reply.status === "failed"
					? `${noun} change applied, but verification could not start`
					: `${noun} change applied — verifying the result`
			);
		},
	});
	const deleting = execution.operation === "delete";
	const accessReason = memberRole.isPending
		? "Checking access…"
		: memberRole.data?.role === "viewer"
			? `You have view-only access to this ${definitionType}.`
			: memberRole.data
				? null
				: `You need edit access to change this ${definitionType}.`;

	return (
		<div className="space-y-1.5">
			<Button
				disabled={Boolean(accessReason) || apply.isPending}
				loading={apply.isPending}
				onClick={() => apply.mutate({ insightId })}
				size="sm"
				tone={deleting ? "destructive" : "neutral"}
				type="button"
				variant={deleting ? "ghost" : "secondary"}
			>
				{accessReason ? "Review access" : action}
			</Button>
			{accessReason ? (
				<p className="text-muted-foreground text-xs">{accessReason}</p>
			) : null}
		</div>
	);
}

export function InvestigationRowSkeleton() {
	return (
		<div className="flex min-h-24 items-start gap-3 px-4 py-4">
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-center justify-between gap-4">
					<Skeleton className="h-4 w-2/5 rounded" />
					<Skeleton className="h-3 w-14 rounded" />
				</div>
				<Skeleton className="h-3 w-full rounded" />
				<Skeleton className="h-3 w-4/5 rounded" />
				<Skeleton className="h-3 w-1/3 rounded" />
			</div>
		</div>
	);
}

function InsightStatusIcon({ insight }: { insight: Insight }) {
	const isInfo = insight.severity === "info";
	const Icon = isInfo ? LightbulbIcon : WarningCircleIcon;

	return (
		<span
			className={cn(
				"flex size-8 shrink-0 items-center justify-center rounded",
				isInfo && "bg-primary/10 text-primary",
				insight.severity === "critical" && "bg-destructive/10 text-destructive",
				insight.severity === "warning" && "bg-warning/10 text-warning"
			)}
		>
			<Icon className="size-4" />
		</span>
	);
}

export function InvestigationRow({ insight }: { insight: Insight }) {
	const change = insight.changePercent;
	const severity =
		insight.severity === "critical"
			? "Critical"
			: insight.severity === "warning"
				? "Warning"
				: "Notice";

	return (
		<List.Row align="start" asChild>
			<Link href={`/insights/${insight.id}`}>
				<InsightStatusIcon insight={insight} />
				<span className="min-w-0 flex-1">
					<span className="line-clamp-2 block font-medium text-foreground text-sm leading-snug">
						{insight.title}
					</span>
					<span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
						{insight.description}
					</span>
					<span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
						<span className="truncate">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">&middot;</span>
						<span
							className={cn(
								"font-medium",
								insight.severity === "critical" && "text-destructive",
								insight.severity === "warning" && "text-warning",
								insight.severity === "info" && "text-primary"
							)}
						>
							{severity}
						</span>
						{change !== undefined && change !== 0 && (
							<>
								<span className="text-muted-foreground/30">&middot;</span>
								<span
									className={cn(
										"tabular-nums",
										insight.sentiment === "positive" && "text-success",
										insight.sentiment === "negative" && "text-destructive"
									)}
								>
									{change > 0 ? "+" : ""}
									{change}%
								</span>
							</>
						)}
					</span>
				</span>
				<ArrowRightIcon
					aria-hidden
					className="mt-1 size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
				/>
			</Link>
		</List.Row>
	);
}

export function CaseState({
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
		reported.intent !== "clarification" &&
		(reported.status === "queued" || reported.status === "running") &&
		reported.createdAt > latest.createdAt;
	const label = verifying
		? "Measuring"
		: latest.outcome.next.type === "act"
			? "Needs attention"
			: latest.outcome.next.type === "ask"
				? "Needs your input"
				: latest.outcome.next.type === "watch"
					? "Measuring"
					: "Verified";

	return (
		<section
			className="border-b bg-muted/20 px-4 py-4 sm:px-5"
			aria-label="Current state"
		>
			<div className="flex items-center justify-between gap-3">
				<p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
					{label}
				</p>
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

export function InvestigationActivity({
	collapseEvidence,
	insightId,
	item,
	websiteId,
}: {
	collapseEvidence: boolean;
	insightId: string | null;
	item: InvestigationItem;
	websiteId: string | null;
}) {
	const { outcome } = item;
	const sourceLink = websiteId
		? investigationSourceLink(item, websiteId)
		: null;
	const execution =
		outcome.next.type === "act" ? outcome.next.execution : undefined;
	const definitionType =
		item.entity.type === "goal" || item.entity.type === "funnel"
			? item.entity.type
			: null;
	const executable = Boolean(
		insightId && execution?.operation && definitionType
	);

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
				sourceHref={
					outcome.next.type === "act" && !executable
						? null
						: (sourceLink?.href ?? null)
				}
			/>

			<ContextUsed snapshot={outcome.contextSnapshot} />

			<NextStep
				hideAction={executable}
				next={outcome.next}
				sourceLink={sourceLink}
			/>

			{insightId && execution?.operation && definitionType ? (
				<div className="flex flex-wrap">
					<ExecuteDefinitionAction
						action={outcome.next.type === "act" ? outcome.next.action : ""}
						definitionType={definitionType}
						execution={execution}
						insightId={insightId}
					/>
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

function investigationSourceLink(
	item: InvestigationItem,
	websiteId: string
): { href: string; label: string } | null {
	const base = `/websites/${encodeURIComponent(websiteId)}`;
	switch (item.entity.type) {
		case "event":
			return {
				href: `${base}/events/${encodeURIComponent(item.entity.id)}`,
				label: "Open event",
			};
		case "funnel":
		case "funnel_step":
			return { href: `${base}/funnels`, label: "Open funnel" };
		case "goal":
			return { href: `${base}/goals`, label: "Open goal" };
		default:
			return null;
	}
}

function NextStep({
	hideAction,
	next,
	sourceLink,
}: {
	hideAction: boolean;
	next: InvestigationNext;
	sourceLink: { href: string; label: string } | null;
}) {
	const copy = nextCopy(next, { executable: hideAction });
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
			{next.type === "act" && !hideAction && sourceLink ? (
				<div className="mt-2">
					<Button asChild size="sm" variant="secondary">
						<Link href={sourceLink.href}>
							{sourceLink.label}
							<ArrowSquareOutIcon aria-hidden className="size-3.5" />
						</Link>
					</Button>
				</div>
			) : null}
		</div>
	);
}

function formatPeriod(period: { from: string; to: string }): string {
	const from = dayjs.utc(period.from).format("MMM D, YYYY");
	const to = dayjs.utc(period.to).format("MMM D, YYYY");
	return from === to ? from : `${from}–${to}`;
}

function nextCopy(
	next: InvestigationNext,
	options?: { executable?: boolean }
): {
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
				label: options?.executable ? "Ready to apply" : "Review needed",
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
			return { body: next.reason, label: "Conclusion" };
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
