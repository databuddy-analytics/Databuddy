"use client";

import Link from "next/link";
import type { BriefInsight } from "@/lib/insight-api";
import {
	LightbulbIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";
import { Button, Card } from "@databuddy/ui";

function LoadingState() {
	return (
		<div aria-label="Loading insights" className="divide-y" role="status">
			<div className="h-20 animate-pulse bg-muted/20" />
			<div className="h-20 animate-pulse bg-muted/20" />
			<div className="h-20 animate-pulse bg-muted/20" />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex items-center gap-3 px-5 py-5">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
				<LightbulbIcon className="size-5 text-primary" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">No insights yet</p>
				<p className="text-muted-foreground text-xs">
					Noteworthy changes and improvements will appear here
				</p>
			</div>
		</div>
	);
}

function ErrorState({ onRetryAction }: { onRetryAction: () => void }) {
	return (
		<div className="flex items-center gap-3 px-5 py-5">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
				<WarningCircleIcon className="size-5 text-red-500" weight="duotone" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					Couldn't load insights
				</p>
				<p className="text-muted-foreground text-xs">
					Recent analysis results couldn't be loaded
				</p>
			</div>
			<Button
				className="shrink-0"
				onClick={onRetryAction}
				size="sm"
				variant="secondary"
			>
				Retry
			</Button>
		</div>
	);
}

function InsightRow({ insight }: { insight: BriefInsight }) {
	const positive = insight.signal.sentiment === "positive";
	const negative = insight.signal.sentiment === "negative";
	const Icon = positive
		? TrendUpIcon
		: negative
			? TrendDownIcon
			: LightbulbIcon;
	const change = insight.signal.changePercent;
	const tone = positive
		? "text-emerald-600"
		: negative
			? "text-amber-600"
			: "text-primary";

	return (
		<Link
			className="flex items-start gap-3 border-t px-5 py-3.5 hover:bg-accent/50"
			href={
				insight.investigationId
					? `/insights/${insight.investigationId}`
					: "/insights"
			}
		>
			<span
				className={`flex size-7 shrink-0 items-center justify-center rounded bg-primary/10 ${tone}`}
			>
				<Icon className="size-4" weight="duotone" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="block truncate font-medium text-foreground text-sm">
					{insight.title}
				</span>
				<span className="mt-0.5 line-clamp-2 block text-muted-foreground text-xs leading-relaxed">
					{insight.summary}
				</span>
				<span className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
					<span>{insight.websiteName ?? insight.websiteDomain}</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span>{insight.signal.entity.label}</span>
					{change === null || change === 0 ? null : (
						<>
							<span className="text-muted-foreground/30">&middot;</span>
							<span className={`font-medium tabular-nums ${tone}`}>
								{change > 0 ? "+" : ""}
								{change.toLocaleString("en-US", {
									maximumFractionDigits: 1,
								})}
								%
							</span>
						</>
					)}
				</span>
			</span>
		</Link>
	);
}

export function InsightsSection({
	insights,
	onRetryAction,
	state,
}: {
	insights: BriefInsight[];
	onRetryAction: () => void;
	state: "error" | "loading" | "ready";
}) {
	let content = <EmptyState />;
	if (state === "loading") {
		content = <LoadingState />;
	} else if (state === "error") {
		content = <ErrorState onRetryAction={onRetryAction} />;
	} else if (insights.length > 0) {
		content = (
			<div>
				{insights.map((insight) => (
					<InsightRow insight={insight} key={insight.id} />
				))}
			</div>
		);
	}

	return (
		<Card>
			<Card.Header className="flex-row items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-center gap-2">
					<LightbulbIcon
						className="size-4 shrink-0 text-primary"
						weight="duotone"
					/>
					<Card.Title className="text-sm">Insights</Card.Title>
				</div>
				<Link
					className="shrink-0 text-muted-foreground text-xs hover:text-foreground"
					href="/insights"
				>
					View all
				</Link>
			</Card.Header>
			{content}
		</Card>
	);
}
