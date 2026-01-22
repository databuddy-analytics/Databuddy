"use client";

import {
	BugIcon,
	CheckCircleIcon,
	GaugeIcon,
	LightningIcon,
	SparkleIcon,
	TrendDownIcon,
	TrendUpIcon,
	WarningCircleIcon,
} from"@phosphor-icons/react";
import Link from"next/link";
import type { ReactNode } from"react";
import { Skeleton } from"@/components/ui/skeleton";
import type {
	Insight,
	InsightSeverity,
	InsightType,
} from"@/hooks/use-smart-insights";
import { cn } from"@/lib/utils";

interface SmartInsightsSectionProps {
	websiteCount?: number;
	insights: Insight[];
	isLoading?: boolean;
}

const insightConfig: Record<
	InsightType,
	{ icon: ReactNode; color: string; bgColor: string }
> = {
	error_spike: {
		icon: <BugIcon className="size-6" weight="duotone" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
	vitals_degraded: {
		icon: <GaugeIcon className="size-6" weight="duotone" />,
		color: "text-amber-500",
		bgColor: "bg-amber-500/10",
	},
	custom_event_spike: {
		icon: <LightningIcon className="size-6" weight="fill" />,
		color: "text-blue-500",
		bgColor: "bg-blue-500/10",
	},
	traffic_drop: {
		icon: <TrendDownIcon className="size-6" weight="fill" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
	traffic_spike: {
		icon: <TrendUpIcon className="size-6" weight="fill" />,
		color: "text-green-500",
		bgColor: "bg-green-500/10",
	},
	uptime_issue: {
		icon: <WarningCircleIcon className="size-6" weight="duotone" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
};

const severityConfig: Record<
	InsightSeverity,
	{ badgeVariant:"destructive" |"amber" |"secondary"; label: string }
> = {
	critical: { badgeVariant:"destructive", label:"Critical" },
	warning: { badgeVariant:"amber", label:"Warning" },
	info: { badgeVariant:"secondary", label:"Info" },
};

function InsightRow({ insight }: { insight: Insight }) {
	const config = insightConfig[insight.type];
	const severity = severityConfig[insight.severity];

	return (
		<Link
			className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
			href={insight.link}
		>
			<div className="flex items-center gap-3">
				<div
					className={cn(
						"flex size-12 shrink-0 items-center justify-center",
						config.bgColor,
						config.color,
					)}
				>
					{config.icon}
				</div>
				<div className="min-w-0 space-y-1.5">
					<p className="truncate font-medium text-base leading-none text-foreground">
						{insight.title}
					</p>
					<p className="truncate text-muted-foreground text-sm leading-none">
						{insight.websiteName ?? insight.websiteDomain}
					</p>
				</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-2">
				{insight.changePercent !== undefined && (
					<div
						className={cn(
							"px-2 py-0.5 font-mono text-xs font-semibold leading-4",
							insight.type === "traffic_drop" || insight.type === "error_spike" || insight.type === "uptime_issue"
								? "bg-red-500/10 text-red-500"
								: "bg-green-500/10 text-green-500",
						)}
					>
						{insight.type === "traffic_drop" ? "-" : "+"}
						{insight.changePercent}%
					</div>
				)}
				<p className="text-muted-foreground text-sm leading-none">
					{insight.description}
				</p>
			</div>
		</Link>
	);
}

function InsightSkeleton() {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<div className="flex items-center gap-3">
				<Skeleton className="size-12 shrink-0" />
				<div className="space-y-1.5">
					<Skeleton className="h-4 w-40" />
					<Skeleton className="h-3.5 w-24" />
				</div>
			</div>
			<div className="flex flex-col items-end gap-2">
				<Skeleton className="h-5 w-14" />
				<Skeleton className="h-3.5 w-40" />
			</div>
		</div>
	);
}

function AllClearState() {
	return (
		<div className="flex items-center gap-3 p-4">
			<div className="flex size-12 shrink-0 items-center justify-center bg-green-500/10">
				<CheckCircleIcon className="size-6 text-green-500" weight="fill" />
			</div>
			<div className="min-w-0 space-y-1.5">
				<p className="font-medium text-base leading-none text-foreground">
					All systems healthy
				</p>
				<p className="text-muted-foreground text-sm leading-none">
					No issues detected across your websites
				</p>
			</div>
		</div>
	);
}

export function SmartInsightsSection({
	websiteCount,
	insights,
	isLoading,
}: SmartInsightsSectionProps) {
	if (isLoading) {
		return (
			<div className="overflow-hidden border bg-background">
				<div className="flex items-center justify-between border-b p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-12 items-center justify-center bg-primary/10">
							<SparkleIcon className="size-6 text-primary" weight="duotone" />
						</div>
						<div className="min-w-0 space-y-1.5">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3.5 w-24" />
						</div>
					</div>
				</div>
				<div className="bg-muted/25">
					<InsightSkeleton />
					<InsightSkeleton />
				</div>
			</div>
		);
	}

	return (
		<div className="overflow-hidden border bg-background">
			<div className="flex items-center justify-between border-b p-4">
				<div className="flex items-center gap-3">
					<div className="flex size-12 items-center justify-center bg-primary/10">
						<SparkleIcon className="size-6 text-primary" weight="duotone" />
					</div>
					<div className="min-w-0 space-y-1.5">
						<h3 className="truncate font-medium text-base leading-none text-foreground">
							Smart Insights
						</h3>
						<p className="truncate text-muted-foreground text-sm leading-none">
							across {websiteCount ?? 0} site{websiteCount === 1 ? "" : "s"}
						</p>
					</div>
				</div>
				{insights.length > 0 && (
					<span className="text-muted-foreground text-sm leading-none">
						{insights.length} {insights.length === 1 ? "issue" : "issues"}
					</span>
				)}
			</div>
			<div className={cn("bg-muted/25", insights.length === 0 && "h-[208px]")}>
				{insights.length === 0 ? (
					<AllClearState />
				) : (
					insights
						.slice(0, 3)
						.map((insight) => <InsightRow insight={insight} key={insight.id} />)
				)}
			</div>
		</div>
	);
}
