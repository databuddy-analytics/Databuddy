"use client";

import {
	EyeIcon,
	HeartbeatIcon,
	MinusIcon,
	TrendDownIcon,
	TrendUpIcon,
	UsersIcon,
} from"@phosphor-icons/react";
import Link from"next/link";
import { Card, CardContent, CardHeader } from"@/components/ui/card";
import { Skeleton } from"@/components/ui/skeleton";
import { cn } from"@/lib/utils";

interface SummaryStatsProps {
	totalActiveUsers: number;
	totalViews: number;
	averageTrend: number;
	trendDirection:"up" |"down" |"neutral";
	websiteCount: number;
	pulseHealthPercentage: number;
	totalMonitors: number;
	activeMonitors: number;
	isLoading?: boolean;
}

function formatNumber(num: number) {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
}

function StatCardSkeleton() {
	return (
		<Card className="overflow-hidden border bg-background gap-0 p-0">
			<CardHeader className="block border-b bg-muted/25 p-0 [.border-b]:pb-0">
				<div className="flex h-36 items-center justify-center">
					<Skeleton className="h-16 w-40" />
				</div>
			</CardHeader>
			<CardContent className="p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<Skeleton className="size-12" />
						<div className="space-y-1.5">
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-3.5 w-20" />
						</div>
					</div>
					<Skeleton className="h-5 w-16" />
				</div>
			</CardContent>
		</Card>
	);
}


export function SummaryStats({
	totalActiveUsers,
	totalViews,
	averageTrend,
	trendDirection,
	websiteCount,
	pulseHealthPercentage,
	totalMonitors,
	activeMonitors,
	isLoading,
}: SummaryStatsProps) {
	// Show loading if explicitly loading OR if we don't have data yet
	const showLoading =
		isLoading ||
		(websiteCount === 0 &&
			totalMonitors === 0 &&
			totalActiveUsers === 0 &&
			totalViews === 0);

	if (showLoading) {
		return (
			<div className="grid gap-5 lg:grid-cols-3">
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</div>
		);
	}

	const TrendIcon =
		trendDirection ==="up"
			? TrendUpIcon
			: trendDirection ==="down"
				? TrendDownIcon
				: MinusIcon;

	const showNoMonitoring = totalMonitors === 0;

	return (
		<div className="grid gap-5 lg:grid-cols-3">
			{/* Total Views */}
			<Card className="overflow-hidden border bg-background gap-0 p-0">
				<CardHeader className="block border-b bg-muted/25 p-0 [.border-b]:pb-0">
					<div className="flex h-36 items-center justify-center">
						<span className="font-semibold text-7xl leading-none text-foreground tabular-nums">
							{formatNumber(totalViews)}
						</span>
					</div>
				</CardHeader>
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex size-12 items-center justify-center bg-muted">
								<EyeIcon className="size-6 text-foreground" weight="duotone" />
							</div>
							<div className="min-w-0 space-y-1.5">
								<p className="truncate font-medium text-base leading-none text-foreground">
									Total Views
								</p>
								<p className="truncate text-muted-foreground text-sm leading-none">
									last 7 days
								</p>
							</div>
						</div>

						{averageTrend > 0 && (
							<span
								className={cn(
									"inline-flex items-center gap-1 px-2 py-0.5 font-mono text-xs font-semibold leading-4",
									trendDirection === "up" && "bg-emerald-500/10 text-emerald-600",
									trendDirection === "down" && "bg-red-500/10 text-red-500",
									trendDirection === "neutral" && "bg-muted text-foreground",
								)}
							>
								<TrendIcon className="size-3" weight="fill" />
								{trendDirection === "up" && "+"}
								{trendDirection === "down" && "-"}
								{averageTrend.toFixed(2)}%
							</span>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Active Users */}
			<Card className="overflow-hidden border bg-background gap-0 p-0">
				<CardHeader className="block border-b bg-muted/25 p-0 [.border-b]:pb-0">
					<div className="flex h-36 items-center justify-center">
						<span className="font-semibold text-7xl leading-none text-foreground tabular-nums">
							{totalActiveUsers}
						</span>
					</div>
				</CardHeader>
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="flex size-12 items-center justify-center bg-muted">
								<UsersIcon className="size-6 text-foreground" weight="duotone" />
							</div>
							<div className="min-w-0 space-y-1.5">
								<p className="truncate font-medium text-base leading-none text-foreground">
									Active Users
								</p>
								<p className="truncate text-muted-foreground text-sm leading-none">
									across {websiteCount} site{websiteCount === 1 ? "" : "s"}
								</p>
							</div>
						</div>
						<div className="inline-flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-semibold leading-4 text-emerald-600">
							<span className="size-1.5 rounded-full bg-emerald-500" />
							LIVE
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Pulse */}
			<Card className="overflow-hidden border bg-background gap-0 p-0">
				<CardHeader className="block border-b bg-muted/25 p-0 [.border-b]:pb-0">
					<div className="flex h-36 items-center justify-center">
						{showNoMonitoring ? (
							<span className="text-muted-foreground text-base leading-none">
								No monitoring
							</span>
						) : (
							<span className="font-semibold text-7xl leading-none text-foreground tabular-nums">
								{activeMonitors}/{totalMonitors}
							</span>
						)}
					</div>
				</CardHeader>
				<CardContent className="p-4">
					<div className="flex items-center gap-3">
						<div className="flex size-12 items-center justify-center bg-muted">
							<HeartbeatIcon
								className="size-6 text-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 space-y-1.5">
							<p className="truncate font-medium text-base leading-none text-foreground">
								Pulse
							</p>
							<p className="truncate text-muted-foreground text-sm leading-none">
								{showNoMonitoring
									? "uptime monitoring"
									: `${pulseHealthPercentage.toFixed(0)}% healthy`}
							</p>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
