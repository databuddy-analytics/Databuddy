"use client";

import { EyeIcon } from "@phosphor-icons/react";
import { HeartbeatIcon } from "@phosphor-icons/react";
import { LockIcon } from "@phosphor-icons/react";
import { MinusIcon } from "@phosphor-icons/react";
import { TrendDownIcon } from "@phosphor-icons/react";
import { TrendUpIcon } from "@phosphor-icons/react";
import { UsersIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface SummaryStatsProps {
	activeMonitors: number;
	averageTrend: number;
	hasPulseAccess: boolean;
	isLoading?: boolean;
	pulseHealthPercentage: number;
	totalActiveUsers: number;
	totalMonitors: number;
	totalViews: number;
	trendDirection: "up" | "down" | "neutral";
	websiteCount: number;
}

function StatCardSkeleton() {
	return (
		<Card className="gap-0 overflow-hidden border bg-card py-0">
			<CardHeader className="dotted-bg gap-0! border-b bg-accent px-3 pt-4 pb-0!">
				<Skeleton className="mx-auto h-16 w-full rounded" />
			</CardHeader>
			<CardContent className="px-4 py-3">
				<div className="flex items-center gap-3">
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
						<div className="flex flex-col gap-1">
							<Skeleton className="h-5 w-16 rounded" />
							<Skeleton className="h-3 w-24 rounded" />
						</div>
						<Skeleton className="h-4 w-12 rounded" />
					</div>
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
	hasPulseAccess,
	isLoading,
}: SummaryStatsProps) {
	const showLoading =
		isLoading ||
		(websiteCount === 0 &&
			totalMonitors === 0 &&
			totalActiveUsers === 0 &&
			totalViews === 0);

	if (showLoading) {
		return (
			<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
				<StatCardSkeleton />
			</div>
		);
	}

	const TrendIcon =
		trendDirection === "up"
			? TrendUpIcon
			: trendDirection === "down"
				? TrendDownIcon
				: MinusIcon;

	return (
		<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
			<Card className="group gap-0 overflow-hidden border bg-card py-0 transition-colors hover:border-primary/60">
				<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
					<div className="flex h-16 items-center justify-center">
						<span className="font-bold text-4xl text-foreground tabular-nums">
							{totalActiveUsers}
						</span>
					</div>
				</CardHeader>
				<CardContent className="px-4 py-3">
					<div className="flex items-center gap-3">
						<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
							<UsersIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-foreground text-sm">
								Active Now
							</p>
							<p className="truncate text-muted-foreground text-xs">
								across {websiteCount} site{websiteCount === 1 ? "" : "s"}
							</p>
						</div>
						{totalActiveUsers > 0 && (
							<span className="relative flex size-2">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
								<span className="relative inline-flex size-2 rounded-full bg-success" />
							</span>
						)}
					</div>
				</CardContent>
			</Card>

			<Card className="group gap-0 overflow-hidden border bg-card py-0 transition-colors hover:border-primary/60">
				<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
					<div className="flex h-16 items-center justify-center">
						<span className="font-bold text-4xl text-foreground tabular-nums">
							{formatNumber(totalViews)}
						</span>
					</div>
				</CardHeader>
				<CardContent className="px-4 py-3">
					<div className="flex items-center gap-3">
						<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
							<EyeIcon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-foreground text-sm">
								Total Views
							</p>
							<p className="truncate text-muted-foreground text-xs">
								last 7 days
							</p>
						</div>
						{averageTrend > 0 && (
							<span
								className={cn(
									"flex items-center gap-0.5 font-semibold text-xs",
									trendDirection === "up" && "text-success",
									trendDirection === "down" && "text-destructive",
									trendDirection === "neutral" && "text-muted-foreground"
								)}
							>
								<TrendIcon
									className="size-3.5"
									weight={trendDirection === "neutral" ? "regular" : "fill"}
								/>
								{trendDirection === "up" && "+"}
								{trendDirection === "down" && "-"}
								{(averageTrend == null || Number.isNaN(averageTrend)
									? 0
									: averageTrend
								).toFixed(0)}
								%
							</span>
						)}
					</div>
				</CardContent>
			</Card>

			<Link className="group block" href="/websites">
				<Card className="h-full gap-0 overflow-hidden border bg-card py-0 transition-colors group-hover:border-primary/60">
					<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
						<div className="flex h-16 items-center justify-center">
							<span className="font-bold text-4xl text-foreground tabular-nums">
								{websiteCount}
							</span>
						</div>
					</CardHeader>
					<CardContent className="px-4 py-3">
						<div className="flex items-center gap-3">
							<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
								<svg
									className="size-4 text-muted-foreground"
									fill="none"
									stroke="currentColor"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="2"
									viewBox="0 0 24 24"
								>
									<title>Websites</title>
									<circle cx="12" cy="12" r="10" />
									<path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
								</svg>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-foreground text-sm">
									Websites
								</p>
								<p className="truncate text-muted-foreground text-xs">
									being tracked
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</Link>

			{hasPulseAccess ? (
				<Link className="group block" href="/monitors">
					<Card className="h-full gap-0 overflow-hidden border bg-card py-0 transition-colors group-hover:border-primary/60">
						<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
							<div className="flex h-16 items-center justify-center gap-2">
								{totalMonitors > 0 ? (
									<span className="font-bold text-4xl text-foreground tabular-nums">
										{activeMonitors}/{totalMonitors}
									</span>
								) : (
									<span className="text-muted-foreground text-sm">
										No monitors
									</span>
								)}
							</div>
						</CardHeader>
						<CardContent className="px-4 py-3">
							<div className="flex items-center gap-3">
								<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
									<HeartbeatIcon
										className="size-4 text-muted-foreground"
										weight="duotone"
									/>
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-foreground text-sm">
										Pulse
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{totalMonitors > 0
											? `${(pulseHealthPercentage == null || Number.isNaN(pulseHealthPercentage) ? 0 : pulseHealthPercentage).toFixed(0)}% healthy`
											: "uptime monitoring"}
									</p>
								</div>
								{totalMonitors > 0 && pulseHealthPercentage === 100 && (
									<span className="flex size-2 rounded-full bg-success" />
								)}
								{totalMonitors > 0 && pulseHealthPercentage < 100 && (
									<span className="flex size-2 rounded-full bg-amber-500" />
								)}
							</div>
						</CardContent>
					</Card>
				</Link>
			) : (
				<Card className="h-full gap-0 overflow-hidden border bg-card py-0">
					<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
						<div className="flex h-16 items-center justify-center">
							<LockIcon
								className="size-6 text-muted-foreground"
								weight="duotone"
							/>
						</div>
					</CardHeader>
					<CardContent className="px-4 py-3">
						<div className="flex items-center gap-3">
							<div className="flex size-7 shrink-0 items-center justify-center rounded bg-accent">
								<HeartbeatIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-foreground text-sm">
									Pulse
								</p>
								<p className="truncate text-muted-foreground text-xs">
									Coming soon
								</p>
							</div>
							<Badge variant="secondary">Invite-only</Badge>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
