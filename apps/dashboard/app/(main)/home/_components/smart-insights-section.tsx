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
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type {
	Insight,
	InsightSeverity,
	InsightType,
} from "@/hooks/use-smart-insights";
import { cn } from "@/lib/utils";

interface SmartInsightsSectionProps {
	insights: Insight[];
	isLoading?: boolean;
}

const insightConfig: Record<
	InsightType,
	{ icon: ReactNode; color: string; bgColor: string }
> = {
	error_spike: {
		icon: <BugIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
	vitals_degraded: {
		icon: <GaugeIcon className="size-4" weight="duotone" />,
		color: "text-amber-500",
		bgColor: "bg-amber-500/10",
	},
	custom_event_spike: {
		icon: <LightningIcon className="size-4" weight="fill" />,
		color: "text-blue-500",
		bgColor: "bg-blue-500/10",
	},
	traffic_drop: {
		icon: <TrendDownIcon className="size-4" weight="fill" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
	traffic_spike: {
		icon: <TrendUpIcon className="size-4" weight="fill" />,
		color: "text-emerald-500",
		bgColor: "bg-emerald-500/10",
	},
	uptime_issue: {
		icon: <WarningCircleIcon className="size-4" weight="duotone" />,
		color: "text-red-500",
		bgColor: "bg-red-500/10",
	},
};

const severityConfig: Record<
	InsightSeverity,
	{ badgeVariant: "destructive" | "amber" | "secondary"; label: string }
> = {
	critical: { badgeVariant: "destructive", label: "Critical" },
	warning: { badgeVariant: "amber", label: "Warning" },
	info: { badgeVariant: "secondary", label: "Info" },
};

function InsightRow({ insight }: { insight: Insight }) {
	const config = insightConfig[insight.type];
	const severity = severityConfig[insight.severity];

	return (
		<Link
			className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
			href={insight.link}
		>
			<div
				className={cn(
					"mt-0.5 flex size-7 shrink-0 items-center justify-center rounded",
					config.bgColor,
					config.color
				)}
			>
				{config.icon}
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-foreground text-sm">
							{insight.title}
						</p>
						<p className="truncate text-muted-foreground text-xs">
							{insight.websiteName ?? insight.websiteDomain}
						</p>
					</div>
					{insight.changePercent !== undefined && insight.changePercent > 0 && (
						<Badge className="shrink-0" variant={severity.badgeVariant}>
							{insight.type === "traffic_drop" ? "-" : "+"}
							{insight.changePercent}%
						</Badge>
					)}
				</div>
				<p className="mt-1 text-muted-foreground text-xs">
					{insight.description}
				</p>
			</div>
		</Link>
	);
}

function InsightSkeleton() {
	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<Skeleton className="mt-0.5 size-7 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-2">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1 space-y-1">
						<Skeleton className="h-4 w-32" />
						<Skeleton className="h-3 w-24" />
					</div>
					<Skeleton className="h-5 w-12 rounded" />
				</div>
				<Skeleton className="h-3 w-48" />
			</div>
		</div>
	);
}

function AllClearState() {
	return (
		<div className="flex items-center gap-3 px-4 py-4">
			<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
				<CheckCircleIcon className="size-5 text-emerald-500" weight="fill" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground text-sm">
					All systems healthy
				</p>
				<p className="text-muted-foreground text-xs">
					No issues detected across your websites
				</p>
			</div>
		</div>
	);
}

export function SmartInsightsSection({
	insights,
	isLoading,
}: SmartInsightsSectionProps) {
	if (isLoading) {
		return (
			<div className="divide-y rounded border bg-card">
				<div className="flex items-center gap-2 border-b px-4 py-3">
					<SparkleIcon className="size-4 text-primary" weight="duotone" />
					<Skeleton className="h-4 w-24" />
				</div>
				<InsightSkeleton />
				<InsightSkeleton />
			</div>
		);
	}

	return (
		<div className="divide-y rounded border bg-card">
			<div className="flex items-center justify-between px-4 py-3">
				<div className="flex items-center gap-2">
					<SparkleIcon className="size-4 text-primary" weight="duotone" />
					<h3 className="font-semibold text-foreground text-sm">
						Smart Insights
					</h3>
				</div>
				{insights.length > 0 && (
					<span className="text-muted-foreground text-xs">
						{insights.length} {insights.length === 1 ? "issue" : "issues"}
					</span>
				)}
			</div>
			{insights.length === 0 ? (
				<AllClearState />
			) : (
				insights
					.slice(0, 5)
					.map((insight) => <InsightRow insight={insight} key={insight.id} />)
			)}
		</div>
	);
}
