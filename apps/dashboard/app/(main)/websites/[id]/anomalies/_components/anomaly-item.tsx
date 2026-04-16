"use client";

import { ArrowDownIcon } from "@phosphor-icons/react";
import { ArrowUpIcon } from "@phosphor-icons/react";
import { BugIcon } from "@phosphor-icons/react";
import { EyeIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import type { ElementType } from "react";
import { Badge } from "@/components/ui/badge";
import { List } from "@/components/ui/composables/list";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface AnomalyItemData {
	baselineMean: number;
	baselineStdDev: number;
	currentValue: number;
	detectedAt: string;
	eventName?: string;
	metric: "pageviews" | "custom_events" | "errors";
	percentChange: number;
	periodEnd: string;
	periodStart: string;
	severity: "warning" | "critical";
	type: "spike" | "drop";
	zScore: number;
}

const METRIC_CONFIG: Record<
	string,
	{ label: string; icon: ElementType; bg: string }
> = {
	pageviews: {
		label: "Pageviews",
		icon: EyeIcon,
		bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
	},
	custom_events: {
		label: "Custom Event",
		icon: LightningIcon,
		bg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
	},
	errors: {
		label: "Errors",
		icon: BugIcon,
		bg: "bg-red-500/10 text-red-600 dark:text-red-400",
	},
};

function formatCompact(value: number): string {
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function formatPeriod(start: string, end: string): string {
	const startDate = new Date(`${start.replace(" ", "T")}Z`);
	const endDate = new Date(`${end.replace(" ", "T")}Z`);

	const formatter = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

	return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

interface AnomalyItemProps {
	anomaly: AnomalyItemData;
}

export function AnomalyItem({ anomaly }: AnomalyItemProps) {
	const config = METRIC_CONFIG[anomaly.metric] ?? METRIC_CONFIG.pageviews;
	const MetricIcon = config.icon;
	const isCritical = anomaly.severity === "critical";
	const SeverityIcon = isCritical ? WarningCircleIcon : WarningIcon;
	const DirectionIcon = anomaly.type === "spike" ? ArrowUpIcon : ArrowDownIcon;
	const changeColor =
		anomaly.type === "spike" ? "text-destructive" : "text-blue-500";

	return (
		<List.Row align="start">
			<List.Cell className="pt-0.5">
				<div
					className={cn(
						"flex size-8 items-center justify-center rounded",
						config.bg
					)}
				>
					<MetricIcon className="size-4" weight="duotone" />
				</div>
			</List.Cell>

			<List.Cell className="w-40 min-w-0 lg:w-52">
				<p className="wrap-break-word text-pretty font-medium text-foreground text-sm">
					{anomaly.eventName ?? config.label}
				</p>
				<p className="mt-0.5 text-muted-foreground text-xs tabular-nums">
					{formatPeriod(anomaly.periodStart, anomaly.periodEnd)}
				</p>
			</List.Cell>

			<List.Cell grow>
				<div className="flex items-center gap-2">
					<Badge
						className="gap-1"
						variant={isCritical ? "destructive" : "amber"}
					>
						<SeverityIcon className="size-3" weight="fill" />
						{anomaly.severity}
					</Badge>
					<span className="text-muted-foreground text-xs">
						{anomaly.type === "spike" ? "Unusually high" : "Unusually low"}
					</span>
				</div>
			</List.Cell>

			<List.Cell className="hidden items-start gap-3 pt-0.5 lg:flex">
				<div className="flex w-16 flex-col items-end">
					<span className="font-semibold text-sm tabular-nums">
						{formatCompact(anomaly.currentValue)}
					</span>
					<span className="text-muted-foreground text-xs">Current</span>
				</div>
				<div className="flex w-16 flex-col items-end">
					<span className="font-semibold text-muted-foreground text-sm tabular-nums">
						{formatCompact(anomaly.baselineMean)}
					</span>
					<span className="text-muted-foreground text-xs">Baseline</span>
				</div>
				<div className="flex w-16 flex-col items-end">
					<span
						className={cn("font-semibold text-sm tabular-nums", changeColor)}
					>
						<DirectionIcon
							className={cn("mb-px inline size-3", changeColor)}
							weight="fill"
						/>
						{Math.abs(anomaly.percentChange).toFixed(1)}%
					</span>
					<span className="text-muted-foreground text-xs">Change</span>
				</div>
			</List.Cell>

			<List.Cell className="w-14 pt-0.5 text-right lg:hidden">
				<span className={cn("font-semibold text-sm tabular-nums", changeColor)}>
					{anomaly.percentChange > 0 ? "+" : ""}
					{anomaly.percentChange.toFixed(1)}%
				</span>
			</List.Cell>
		</List.Row>
	);
}

export function AnomalyItemSkeleton() {
	return (
		<div className="flex h-15 items-center gap-4 border-border/80 border-b px-4 last:border-b-0">
			<Skeleton className="size-8 shrink-0 rounded" />
			<div className="min-w-0 flex-1 space-y-1.5">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="h-3 w-48 max-w-full" />
			</div>
			<div className="hidden shrink-0 items-center gap-3 lg:flex">
				<Skeleton className="h-4 w-10 rounded" />
				<Skeleton className="h-4 w-10 rounded" />
				<Skeleton className="h-4 w-10 rounded" />
			</div>
			<Skeleton className="ms-auto h-4 w-12 shrink-0 rounded lg:hidden" />
		</div>
	);
}
