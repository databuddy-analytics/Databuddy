"use client";

import { ArrowRightIcon } from "@phosphor-icons/react";
import { BugIcon } from "@phosphor-icons/react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { ChartLineUpIcon } from "@phosphor-icons/react";
import { CopyIcon } from "@phosphor-icons/react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { GaugeIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { LinkIcon } from "@phosphor-icons/react";
import { RocketIcon } from "@phosphor-icons/react";
import { ThumbsDownIcon } from "@phosphor-icons/react";
import { ThumbsUpIcon } from "@phosphor-icons/react";
import { TrendDownIcon } from "@phosphor-icons/react";
import { TrendUpIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { type ReactNode, useMemo } from "react";
import { toast } from "sonner";
import type { InsightFeedbackVote } from "@/app/(main)/insights/lib/insight-feedback-vote";
import {
	buildInsightAgentCopyText,
	buildInsightShareUrl,
	extractInsightPathHint,
	formatComparisonWindow,
	formatInsightFreshness,
} from "@/app/(main)/insights/lib/insight-meta";
import { InsightMetrics } from "@/components/insight-metrics";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
	changePercentChipClassName,
	formatSignedChangePercent,
} from "@/lib/insight-signal-key";
import type {
	Insight,
	InsightSentiment,
	InsightType,
} from "@/lib/insight-types";
import { cn } from "@/lib/utils";

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
};

const SENTIMENT_STYLES: Record<
	InsightSentiment,
	{ label: string; color: string }
> = {
	positive: { label: "Positive", color: "text-emerald-600" },
	neutral: { label: "Neutral", color: "text-muted-foreground" },
	negative: { label: "Needs attention", color: "text-red-500" },
};

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

export interface InsightCardProps {
	expanded: boolean;
	feedbackVote?: InsightFeedbackVote | null;
	insight: Insight;
	onDismissAction?: () => void;
	onFeedbackAction?: (vote: InsightFeedbackVote | null) => void;
	onToggleAction: () => void;
	variant?: "full" | "compact";
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
	const sentimentStyle = SENTIMENT_STYLES[insight.sentiment];
	const freshnessLine = formatInsightFreshness(insight);

	const agentHref = useMemo(() => {
		if (isCompact) {
			return "";
		}
		const chatId = crypto.randomUUID();
		const prompt = encodeURIComponent(buildDiagnosticPrompt(insight));
		return `/websites/${insight.websiteId}/agent/${chatId}?prompt=${prompt}`;
	}, [isCompact, insight]);

	const pathHint = useMemo(
		() => (isCompact ? null : extractInsightPathHint(insight)),
		[isCompact, insight]
	);

	const analyticsHref = useMemo(() => {
		if (isCompact) {
			return insight.link;
		}
		if (pathHint) {
			return `/websites/${insight.websiteId}/events/stream?path=${encodeURIComponent(pathHint)}`;
		}
		return insight.link;
	}, [isCompact, insight.websiteId, insight.link, pathHint]);

	const analyticsLabel = pathHint ? "View events" : "Overview";

	const copyAgentPromptAction = async () => {
		try {
			await navigator.clipboard.writeText(buildInsightAgentCopyText(insight));
			toast.success("Copied prompt for agent");
		} catch {
			toast.error("Could not copy");
		}
	};

	const copyLinkAction = async () => {
		const url = buildInsightShareUrl(insight.id);
		if (!url) {
			return;
		}
		try {
			await navigator.clipboard.writeText(url);
			toast.success("Copied link to this insight");
		} catch {
			toast.error("Could not copy link");
		}
	};

	return (
		<div
			className={cn(
				"group scroll-mt-24 border-b transition-colors last:border-b-0",
				expanded ? "bg-accent/20" : "hover:bg-accent/40"
			)}
			id={`insight-${insight.id}`}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: full-row toggle cannot use <button> because of nested dismiss control */}
			<div
				className={cn(
					"flex cursor-pointer items-start gap-3 px-4",
					isCompact ? "py-3" : "py-3.5"
				)}
				onClick={onToggleAction}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onToggleAction();
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div
					className={cn(
						"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
						typeStyle.bg,
						typeStyle.color
					)}
				>
					{typeStyle.icon}
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center justify-between gap-2">
						<p className="truncate font-medium text-foreground text-sm">
							{insight.title}
						</p>
						<div className="flex shrink-0 items-center gap-1.5">
							{!isCompact && onDismissAction && (
								<button
									aria-label="Dismiss insight"
									className="flex size-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:opacity-100"
									onClick={(e) => {
										e.stopPropagation();
										onDismissAction();
									}}
									type="button"
								>
									<XIcon className="size-3" weight="bold" />
								</button>
							)}
							<span className="font-mono text-[11px] text-muted-foreground tabular-nums">
								{insight.priority}/10
							</span>
							<CaretDownIcon
								className={cn(
									"size-3 text-muted-foreground transition-transform",
									expanded && "rotate-180"
								)}
								weight="fill"
							/>
						</div>
					</div>
					<div className="mt-0.5 flex items-center gap-1.5 text-xs">
						<span className="truncate text-muted-foreground">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						<span className="text-muted-foreground/30">&middot;</span>
						<span className={sentimentStyle.color}>{sentimentStyle.label}</span>
						{insight.changePercent !== undefined &&
							insight.changePercent !== 0 && (
								<>
									<span className="text-muted-foreground/30">&middot;</span>
									<span
										className={cn(
											"tabular-nums",
											changePercentChipClassName(insight.changePercent)
										)}
									>
										{formatSignedChangePercent(insight.changePercent)}
									</span>
								</>
							)}
					</div>
					{!expanded && (
						<p className="mt-1 line-clamp-1 text-muted-foreground text-xs">
							{insight.description}
						</p>
					)}
				</div>
			</div>

			{expanded && (
				<>
					{/* biome-ignore lint/a11y/useSemanticElements: expanded panel toggle; nested links/buttons prevent a single <button> wrapper */}
					<div
						className="flex flex-col gap-4 px-4 pb-5 pl-14 sm:pl-15"
						onClick={onToggleAction}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onToggleAction();
							}
						}}
						role="button"
						tabIndex={-1}
					>
						{!isCompact && insight.metrics && insight.metrics.length > 0 && (
							<InsightMetrics metrics={insight.metrics} />
						)}

						<div className="flex flex-col gap-2.5">
							<p className="text-pretty text-[13px] text-muted-foreground leading-relaxed">
								{insight.description}
							</p>

							<p className="text-pretty border-primary/40 border-l-2 pl-3 text-foreground/80 text-xs leading-relaxed">
								{insight.suggestion}
							</p>
						</div>

						{!isCompact && (
							<div className="flex items-center gap-2">
								<Link
									aria-label="Open AI agent with this insight as context"
									className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs transition-opacity hover:opacity-90"
									href={agentHref}
									onClick={(e) => e.stopPropagation()}
								>
									Ask agent
									<ArrowRightIcon className="size-3" weight="fill" />
								</Link>
								<Link
									aria-label={
										pathHint
											? `View live events filtered to ${pathHint}`
											: "Open website overview"
									}
									className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
									href={analyticsHref}
									onClick={(e) => e.stopPropagation()}
								>
									{analyticsLabel}
								</Link>

								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<button
											aria-label="More actions"
											className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
											onClick={(e) => e.stopPropagation()}
											type="button"
										>
											<DotsThreeIcon className="size-4" weight="bold" />
										</button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="start" className="w-44">
										<DropdownMenuItem
											onClick={(e) => {
												e.stopPropagation();
												copyAgentPromptAction();
											}}
										>
											<CopyIcon className="size-4" weight="duotone" />
											Copy prompt
										</DropdownMenuItem>
										<DropdownMenuItem onClick={copyLinkAction}>
											<LinkIcon className="size-4" weight="duotone" />
											Copy link
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>

								<div className="ml-auto flex items-center gap-1.5">
									{freshnessLine && (
										<span className="text-[11px] text-muted-foreground">
											{freshnessLine}
										</span>
									)}
									{onFeedbackAction && (
										<>
											<button
												aria-label="Mark as helpful"
												aria-pressed={feedbackVote === "up"}
												className={cn(
													"flex size-7 items-center justify-center rounded border transition-colors",
													feedbackVote === "up"
														? "border-primary bg-primary/10 text-primary"
														: "text-muted-foreground hover:bg-accent hover:text-foreground"
												)}
												onClick={(e) => {
													e.stopPropagation();
													onFeedbackAction(feedbackVote === "up" ? null : "up");
												}}
												type="button"
											>
												<ThumbsUpIcon className="size-3.5" weight="duotone" />
											</button>
											<button
												aria-label="Mark as not helpful"
												aria-pressed={feedbackVote === "down"}
												className={cn(
													"flex size-7 items-center justify-center rounded border transition-colors",
													feedbackVote === "down"
														? "border-destructive bg-destructive/10 text-destructive"
														: "text-muted-foreground hover:bg-accent hover:text-foreground"
												)}
												onClick={(e) => {
													e.stopPropagation();
													onFeedbackAction(
														feedbackVote === "down" ? null : "down"
													);
												}}
												type="button"
											>
												<ThumbsDownIcon className="size-3.5" weight="duotone" />
											</button>
										</>
									)}
								</div>
							</div>
						)}
					</div>
				</>
			)}
		</div>
	);
}

export function InsightCardSkeleton() {
	return (
		<div className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
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
