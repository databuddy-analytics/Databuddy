"use client";

import Link from "next/link";
import type { Insight } from "@/lib/insight-api";
import { cn } from "@/lib/utils";
import {
	ArrowRightIcon,
	CheckCircleIcon,
	LightbulbIcon,
	WarningCircleIcon,
} from "@databuddy/ui/icons";

function InsightStatusIcon({ insight }: { insight: Insight }) {
	if (insight.status === "resolved") {
		return (
			<span className="flex size-7 shrink-0 items-center justify-center rounded bg-emerald-500/10 text-emerald-600">
				<CheckCircleIcon className="size-4" weight="fill" />
			</span>
		);
	}

	const isInfo = insight.severity === "info";
	const Icon = isInfo ? LightbulbIcon : WarningCircleIcon;

	return (
		<span
			className={cn(
				"flex size-7 shrink-0 items-center justify-center rounded",
				isInfo && "bg-primary/10 text-primary",
				insight.severity === "critical" && "bg-red-500/10 text-red-500",
				insight.severity === "warning" && "bg-amber-500/10 text-amber-500"
			)}
		>
			<Icon className="size-4" weight="duotone" />
		</span>
	);
}

function resolutionLabel(insight: Insight): string | null {
	if (insight.status !== "resolved") {
		return null;
	}
	if (insight.resolvedReason === "stale") {
		return "Archived";
	}
	return insight.resolvedReason === "recovered" ? "Recovered" : "Resolved";
}

export function InvestigationRow({ insight }: { insight: Insight }) {
	const status = resolutionLabel(insight);
	const change = insight.changePercent;

	return (
		<div
			className={cn(
				"group flex items-stretch border-b transition-colors last:border-b-0 hover:bg-accent/40",
				insight.status === "resolved" && "bg-muted/20"
			)}
		>
			<Link
				className="flex min-w-0 flex-1 items-start gap-3 px-5 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
				href={`/insights/${insight.id}`}
			>
				<InsightStatusIcon insight={insight} />
				<span className="min-w-0 flex-1">
					<span className="line-clamp-1 block font-medium text-foreground text-sm leading-snug">
						{insight.title}
					</span>
					<span className="mt-0.5 line-clamp-1 block text-muted-foreground text-xs leading-relaxed">
						{insight.description}
					</span>
					<span className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
						<span className="truncate">
							{insight.websiteName ?? insight.websiteDomain}
						</span>
						{status && (
							<>
								<span className="text-muted-foreground/30">&middot;</span>
								<span className="font-medium text-emerald-600">{status}</span>
							</>
						)}
						{change !== undefined && change !== 0 && (
							<>
								<span className="text-muted-foreground/30">&middot;</span>
								<span
									className={cn(
										"tabular-nums",
										insight.sentiment === "positive" && "text-emerald-600",
										insight.sentiment === "negative" && "text-red-500"
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
					className="mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
					weight="bold"
				/>
			</Link>
		</div>
	);
}
