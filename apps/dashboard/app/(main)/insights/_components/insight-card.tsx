"use client";

import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";
import type { InsightFeedbackVote } from "@/app/(main)/insights/lib/insight-feedback-vote";
import {
	toInsightCardViewModel,
	type InsightCardViewModel,
} from "@/app/(main)/insights/lib/insight-card-view-model";
import {
	buildInsightAgentCopyText,
	buildInsightShareUrl,
	extractInsightPathHint,
	formatComparisonWindow,
	formatInsightFreshness,
} from "@/app/(main)/insights/lib/insight-meta";
import { InsightMetrics } from "@/components/insight-metrics";
import { Button, Skeleton } from "@databuddy/ui";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
	changePercentChipClassName,
	formatSignedChangePercent,
} from "@/lib/insight-signal-key";
import type { Insight, InsightAction, InsightType } from "@/lib/insight-types";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	BugIcon,
	CaretDownIcon,
	ChartLineUpIcon,
	CopyIcon,
	DotsThreeIcon,
	GaugeIcon,
	LightbulbFilamentIcon,
	LightningIcon,
	LinkIcon,
	RocketIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { DropdownMenu } from "@databuddy/ui/client";

const TYPE_STYLES: Record<
	InsightType,
	{ icon: ReactNode; color: string; bg: string }
> = {
	error_spike: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	new_errors: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	vitals_degraded: {
		icon: <GaugeIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	custom_event_spike: {
		icon: <LightningIcon className="size-4" weight="fill" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	traffic_drop: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	traffic_spike: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	bounce_rate_change: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	engagement_change: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	referrer_change: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	page_trend: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-blue-500",
		bg: "bg-blue-500/10",
	},
	positive_trend: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	performance: {
		icon: <RocketIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	uptime_issue: {
		icon: <WarningCircleIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	conversion_leak: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	funnel_regression: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	channel_concentration: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	reliability_improved: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	persistent_error_hotspot: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	quality_shift: {
		icon: <ChartLineUpIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
	cross_property_dependency: {
		icon: <LinkIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	performance_improved: {
		icon: <RocketIcon className="size-4" weight="duotone" />,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10",
	},
	deploy_correlation: {
		icon: <RocketIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bg: "bg-amber-500/10",
	},
	segment_regression: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	error_impact: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bg: "bg-red-500/10",
	},
	cross_signal: {
		icon: <LinkIcon className="size-4" weight="duotone" />,
		color: "text-violet-500",
		bg: "bg-violet-500/10",
	},
};

type InsightCardVariant = "full" | "compact";
type InsightTypeStyle = (typeof TYPE_STYLES)[InsightType];

interface InsightCardLinks {
	agentHref: string;
	analyticsHref: string;
	analyticsLabel: string;
	pathHint: string | null;
}

function buildDiagnosticPrompt(insight: Insight): string {
	const parts = [
		`Diagnose this issue on ${insight.websiteName ?? insight.websiteDomain}:`,
		`"${insight.title}"`,
		"",
		`Context: ${insight.description}`,
	];

	if (insight.changePercent !== undefined && insight.changePercent !== 0) {
		parts.push(`Change: ${formatSignedChangePercent(insight.changePercent)}`);
	}

	const windowLine = formatComparisonWindow(insight);
	if (windowLine) {
		parts.push("", `Comparison window: ${windowLine}`);
	}

	const pathHint = extractInsightPathHint(insight);
	if (pathHint) {
		parts.push(
			"",
			`Focus on page path ${pathHint} in analytics when relevant.`
		);
	}

	parts.push(
		"",
		"Investigate the root cause using this site's analytics for the comparison window above, and provide a clear explanation of what's happening and specific steps to fix or improve it."
	);

	return parts.join("\n");
}

function useInsightCardLinks(insight: Insight): InsightCardLinks {
	const agentHref = useMemo(() => {
		const chatId = crypto.randomUUID();
		const prompt = encodeURIComponent(buildDiagnosticPrompt(insight));
		return `/websites/${insight.websiteId}/agent/${chatId}?prompt=${prompt}`;
	}, [insight]);

	const pathHint = useMemo(() => extractInsightPathHint(insight), [insight]);

	const analyticsHref = useMemo(() => {
		if (pathHint) {
			return `/websites/${insight.websiteId}/events/stream?path=${encodeURIComponent(pathHint)}`;
		}
		return insight.link;
	}, [insight.websiteId, insight.link, pathHint]);

	return {
		agentHref,
		analyticsHref,
		analyticsLabel: pathHint ? "View evidence" : "Open analytics",
		pathHint,
	};
}

function InsightIcon({ typeStyle }: { typeStyle: InsightTypeStyle }) {
	return (
		<span
			className={cn(
				"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
				typeStyle.bg,
				typeStyle.color
			)}
		>
			{typeStyle.icon}
		</span>
	);
}

function InsightChange({ insight }: { insight: Insight }) {
	if (insight.changePercent === undefined || insight.changePercent === 0) {
		return null;
	}

	return (
		<>
			<span className="text-muted-foreground/30">&middot;</span>
			<span
				className={cn(
					"tabular-nums",
					changePercentChipClassName(insight.changePercent, insight.sentiment)
				)}
			>
				{formatSignedChangePercent(insight.changePercent)}
			</span>
		</>
	);
}

interface InsightCardHeaderProps {
	expanded: boolean;
	insight: Insight;
	isCompact: boolean;
	onDismissAction?: () => void;
	onToggleAction: () => void;
	typeStyle: InsightTypeStyle;
	view: InsightCardViewModel;
}

function InsightCardHeader({
	expanded,
	insight,
	isCompact,
	onDismissAction,
	onToggleAction,
	typeStyle,
	view,
}: InsightCardHeaderProps) {
	return (
		<div
			className={cn(
				"flex items-start gap-3 px-5",
				isCompact ? "py-3" : "py-3.5"
			)}
		>
			<Button
				className="h-auto min-h-0 min-w-0 flex-1 items-start justify-start gap-3 whitespace-normal rounded-none bg-transparent p-0 text-left font-normal text-foreground hover:bg-transparent active:scale-100 active:bg-transparent"
				onClick={onToggleAction}
				variant="ghost"
			>
				<InsightIcon typeStyle={typeStyle} />
				<span className="min-w-0 flex-1">
					<span className="flex items-center justify-between gap-2">
						<span className="line-clamp-2 font-medium text-foreground text-sm leading-snug">
							{view.headline}
						</span>
						<CaretDownIcon
							className={cn(
								"size-3 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-180"
							)}
							weight="fill"
						/>
					</span>
					<span className="mt-0.5 flex items-center gap-1.5 text-xs">
						<span className="truncate text-muted-foreground">
							{view.metaLabel}
						</span>
						<InsightChange insight={insight} />
					</span>
					{!expanded && (
						<span className="mt-1 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
							{view.whyItMatters}
						</span>
					)}
				</span>
			</Button>
			{!isCompact && onDismissAction && (
				<Button
					aria-label="Dismiss insight"
					className="size-6 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
					onClick={onDismissAction}
					size="icon"
					variant="ghost"
				>
					<XIcon className="size-3" weight="bold" />
				</Button>
			)}
		</div>
	);
}

function InsightCardPanel({
	children,
	expanded,
}: {
	children: ReactNode;
	expanded: boolean;
}) {
	return (
		<div
			aria-hidden={!expanded}
			className={cn(
				"grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
				expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
			)}
			inert={expanded ? undefined : true}
		>
			<div className="min-h-0 overflow-hidden">
				<div className="space-y-4 border-border/60 border-t px-5 pt-4 pb-5 transition-transform duration-300 ease-out motion-reduce:transition-none">
					{children}
				</div>
			</div>
		</div>
	);
}

const ACTION_ICONS: Record<InsightAction["type"], ReactNode> = {
	fix_goal: <BugIcon className="size-3" weight="duotone" />,
	create_funnel: <ChartLineUpIcon className="size-3" weight="duotone" />,
	add_custom_event: <LightningIcon className="size-3" weight="fill" />,
	create_annotation: (
		<LightbulbFilamentIcon className="size-3" weight="duotone" />
	),
	update_config: <GaugeIcon className="size-3" weight="duotone" />,
	add_tracking: <LightningIcon className="size-3" weight="fill" />,
	investigate_further: <ArrowRightIcon className="size-3" weight="fill" />,
	code_fix: <RocketIcon className="size-3" weight="duotone" />,
};

function InsightActionPill({ action }: { action: InsightAction }) {
	const handleClick = async () => {
		if (
			(action.type === "code_fix" || action.type === "investigate_further") &&
			action.params.prompt
		) {
			try {
				await navigator.clipboard.writeText(action.params.prompt);
				toast.success(
					action.type === "code_fix"
						? "Copied to clipboard -- paste in Cursor or Claude Code"
						: "Copied investigation prompt"
				);
			} catch {
				toast.error("Could not copy to clipboard");
			}
			return;
		}
		toast.info(`${action.label}`);
	};

	return (
		<button
			className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-foreground/80 text-xs transition-colors hover:bg-accent hover:text-foreground"
			onClick={handleClick}
			type="button"
		>
			{ACTION_ICONS[action.type]}
			{action.label}
		</button>
	);
}

function InsightCopy({ view }: { view: InsightCardViewModel }) {
	return (
		<>
			<section className="space-y-1.5">
				<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Why it matters
				</p>
				<p className="text-pretty text-[13px] text-foreground/85 leading-relaxed">
					{view.whyItMatters}
				</p>
			</section>

			{view.rootCause && (
				<section className="space-y-1.5">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Root cause
					</p>
					<p className="text-pretty text-[13px] text-foreground/85 leading-relaxed">
						{view.rootCause}
					</p>
				</section>
			)}

			{view.investigationEvidence.length > 0 && (
				<section className="space-y-1.5">
					<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Evidence
					</p>
					<ul className="space-y-1">
						{view.investigationEvidence.map((e, i) => (
							<li
								className="flex gap-2 text-[13px] text-muted-foreground leading-relaxed"
								key={`ev-${i}`}
							>
								<span className="shrink-0 text-muted-foreground/50">
									&bull;
								</span>
								<span>{e.description}</span>
							</li>
						))}
					</ul>
				</section>
			)}

			{view.nextStep && (
				<section className="space-y-1.5 rounded-lg border border-border/60 bg-accent/40 p-3">
					<div className="flex items-center gap-2">
						<LightbulbFilamentIcon
							className="size-4 shrink-0 text-amber-500"
							weight="duotone"
						/>
						<p className="font-medium text-foreground text-xs uppercase tracking-wide">
							Do this next
						</p>
					</div>
					<p className="text-pretty pl-6 text-foreground/85 text-xs leading-relaxed">
						{view.nextStep}
					</p>
					{view.actions.length > 0 && (
						<div className="flex flex-wrap gap-1.5 pt-1.5 pl-6">
							{view.actions.map((action, i) => (
								<InsightActionPill action={action} key={`action-${i}`} />
							))}
						</div>
					)}
				</section>
			)}
		</>
	);
}

function InsightMetricsSection({ view }: { view: InsightCardViewModel }) {
	if (view.metrics.length === 0) {
		return null;
	}

	return (
		<section className="space-y-2">
			<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				Metrics
			</p>
			<InsightMetrics metrics={view.metrics} />
		</section>
	);
}

interface InsightCardActionsProps {
	comparisonWindow: string | null;
	feedbackVote?: InsightFeedbackVote | null;
	freshnessLine: string | null;
	insight: Insight;
	isCompact: boolean;
	links: InsightCardLinks;
	onCopyLink: (value: string) => void;
	onCopyPrompt: (value: string) => void;
	onFeedbackAction?: (vote: InsightFeedbackVote | null) => void;
	view: InsightCardViewModel;
}

function InsightCardActions({
	comparisonWindow,
	feedbackVote,
	freshnessLine,
	insight,
	isCompact,
	links,
	onCopyLink,
	onCopyPrompt,
	onFeedbackAction,
	view,
}: InsightCardActionsProps) {
	const actions = (
		<>
			<Link
				aria-label="Open AI agent with this insight as context"
				className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
				href={links.agentHref}
			>
				Ask agent
				<ArrowRightIcon className="size-3" weight="fill" />
			</Link>
			<Link
				aria-label={
					links.pathHint
						? `View live events filtered to ${links.pathHint}`
						: "Open website overview"
				}
				className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
				href={links.analyticsHref}
			>
				{view.primaryActionLabel}
			</Link>
		</>
	);

	if (isCompact) {
		return <div className="flex items-center gap-2">{actions}</div>;
	}

	return (
		<div className="flex items-center justify-between gap-3">
			<div className="flex items-center gap-2">
				{actions}
				<InsightOverflowMenu
					insight={insight}
					onCopyLink={onCopyLink}
					onCopyPrompt={onCopyPrompt}
				/>
			</div>

			<div className="flex items-center gap-2">
				{(freshnessLine || comparisonWindow) && (
					<span className="hidden text-[11px] text-muted-foreground sm:block">
						{freshnessLine}
					</span>
				)}
				{onFeedbackAction && (
					<InsightFeedbackButtons
						onFeedbackAction={onFeedbackAction}
						vote={feedbackVote}
					/>
				)}
			</div>
		</div>
	);
}

function InsightOverflowMenu({
	insight,
	onCopyLink,
	onCopyPrompt,
}: {
	insight: Insight;
	onCopyLink: (value: string) => void;
	onCopyPrompt: (value: string) => void;
}) {
	return (
		<DropdownMenu>
			<DropdownMenu.Trigger
				aria-label="More actions"
				className="flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<DotsThreeIcon className="size-4" weight="bold" />
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" className="w-44">
				<DropdownMenu.Item
					onClick={() => {
						onCopyPrompt(buildInsightAgentCopyText(insight));
					}}
				>
					<CopyIcon className="size-4" weight="duotone" />
					Copy prompt
				</DropdownMenu.Item>
				<DropdownMenu.Item
					onClick={() => {
						const url = buildInsightShareUrl(insight.id);
						if (url) {
							onCopyLink(url);
						}
					}}
				>
					<LinkIcon className="size-4" weight="duotone" />
					Copy link
				</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu>
	);
}

function InsightFeedbackButtons({
	onFeedbackAction,
	vote,
}: {
	onFeedbackAction: (vote: InsightFeedbackVote | null) => void;
	vote?: InsightFeedbackVote | null;
}) {
	return (
		<div className="flex items-center gap-1">
			<Button
				aria-label="Mark as helpful"
				aria-pressed={vote === "up"}
				className={cn(
					"size-7 rounded-md border",
					vote === "up"
						? "border-primary bg-primary/10 text-primary"
						: "text-muted-foreground hover:bg-accent hover:text-foreground"
				)}
				onClick={() => onFeedbackAction(vote === "up" ? null : "up")}
				size="icon"
				variant="ghost"
			>
				<ThumbsUpIcon className="size-3.5" weight="duotone" />
			</Button>
			<Button
				aria-label="Mark as not helpful"
				aria-pressed={vote === "down"}
				className={cn(
					"size-7 rounded-md border",
					vote === "down"
						? "border-destructive bg-destructive/10 text-destructive"
						: "text-muted-foreground hover:bg-accent hover:text-foreground"
				)}
				onClick={() => onFeedbackAction(vote === "down" ? null : "down")}
				size="icon"
				variant="ghost"
			>
				<ThumbsDownIcon className="size-3.5" weight="duotone" />
			</Button>
		</div>
	);
}

export interface InsightCardProps {
	expanded: boolean;
	feedbackVote?: InsightFeedbackVote | null;
	insight: Insight;
	onDismissAction?: () => void;
	onFeedbackAction?: (vote: InsightFeedbackVote | null) => void;
	onToggleAction: () => void;
	variant?: InsightCardVariant;
}

export function InsightCard({
	insight,
	expanded,
	onToggleAction,
	onDismissAction,
	feedbackVote,
	onFeedbackAction,
	variant = "full",
}: InsightCardProps) {
	const isCompact = variant === "compact";
	const typeStyle = TYPE_STYLES[insight.type];
	const links = useInsightCardLinks(insight);
	const view = useMemo(() => toInsightCardViewModel(insight), [insight]);
	const freshnessLine = formatInsightFreshness(insight);
	const comparisonWindow = useMemo(
		() => (isCompact ? null : formatComparisonWindow(insight)),
		[isCompact, insight]
	);

	const { copyToClipboard: copyPrompt } = useCopyToClipboard({
		onCopy: () => toast.success("Copied prompt for agent"),
	});

	const { copyToClipboard: copyLink } = useCopyToClipboard({
		onCopy: () => toast.success("Copied link to this insight"),
	});

	return (
		<div
			className={cn(
				"group scroll-mt-24 border-b transition-colors last:border-b-0",
				expanded ? "bg-accent/20" : "hover:bg-accent/40 active:bg-accent/50"
			)}
			id={`insight-${insight.id}`}
		>
			<InsightCardHeader
				expanded={expanded}
				insight={insight}
				isCompact={isCompact}
				onDismissAction={onDismissAction}
				onToggleAction={onToggleAction}
				typeStyle={typeStyle}
				view={view}
			/>

			<InsightCardPanel expanded={expanded}>
				<InsightCopy view={view} />
				{!isCompact && <InsightMetricsSection view={view} />}
				<InsightCardActions
					comparisonWindow={comparisonWindow}
					feedbackVote={feedbackVote}
					freshnessLine={freshnessLine}
					insight={insight}
					isCompact={isCompact}
					links={links}
					onCopyLink={copyLink}
					onCopyPrompt={copyPrompt}
					onFeedbackAction={onFeedbackAction}
					view={view}
				/>
			</InsightCardPanel>
		</div>
	);
}

export function InsightCardSkeleton() {
	return (
		<div className="flex items-start gap-3 border-b px-5 py-3 last:border-b-0">
			<Skeleton className="mt-0.5 size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-48 rounded" />
						<Skeleton className="h-3 w-32 rounded" />
					</div>
					<Skeleton className="h-4 w-12 rounded" />
				</div>
				<Skeleton className="h-3 w-56 rounded" />
			</div>
		</div>
	);
}
