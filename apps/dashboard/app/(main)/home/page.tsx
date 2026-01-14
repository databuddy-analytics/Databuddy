"use client";

import {
	ArrowClockwiseIcon,
	GlobeIcon,
	HouseIcon,
	PlusIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WebsiteDialog } from "@/components/website-dialog";
import { useGlobalAnalytics } from "@/hooks/use-global-analytics";
import { usePulseStatus } from "@/hooks/use-pulse-status";
import { useSmartInsights } from "@/hooks/use-smart-insights";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { PageHeader } from "../websites/_components/page-header";
import { WebsiteCard } from "../websites/_components/website-card";
import { MonitorsSection } from "./_components/monitors-section";
import { SmartInsightsSection } from "./_components/smart-insights-section";
import { SummaryStats } from "./_components/summary-stats";

function WebsiteCardSkeleton() {
	return (
		<Card className="animate-pulse overflow-hidden pt-0">
			<CardHeader className="dotted-bg gap-0! border-b bg-accent px-3 pt-4 pb-0!">
				<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
			</CardHeader>
			<CardContent className="px-4 py-3">
				<div className="flex items-center gap-3">
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
						<div className="flex flex-col gap-1">
							<Skeleton className="h-3.5 w-24 rounded" />
							<Skeleton className="h-3 w-32 rounded" />
						</div>
						<div className="flex flex-col items-end gap-1">
							<Skeleton className="h-3 w-12 rounded" />
							<Skeleton className="h-2.5 w-8 rounded" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export default function HomePage() {
	const [dialogOpen, setDialogOpen] = useState(false);

	const {
		websites,
		chartData,
		activeUsers,
		isLoading,
		isError,
		isFetching,
		refetch: refetchWebsites,
	} = useWebsites();

	const {
		totalActiveUsers,
		totalViews,
		averageTrend,
		trendDirection,
		websiteCount,
	} = useGlobalAnalytics();

	const {
		monitors,
		totalMonitors,
		activeMonitors,
		healthPercentage,
		isLoading: isPulseLoading,
		isFetching: isPulseFetching,
		refetch: refetchMonitors,
	} = usePulseStatus();

	const {
		insights,
		isLoading: isInsightsLoading,
		isFetching: isInsightsFetching,
		refetch: refetchInsights,
	} = useSmartInsights();

	const handleRefetch = async () => {
		await Promise.all([
			refetchWebsites(),
			refetchMonitors(),
			refetchInsights(),
		]);
	};

	return (
		<div className="flex h-full flex-col">
			<PageHeader
				description="Overview of your analytics across all websites"
				icon={<HouseIcon />}
				right={
					<>
						<Button
							aria-label="Refresh data"
							disabled={
								isLoading ||
								isFetching ||
								isPulseLoading ||
								isPulseFetching ||
								isInsightsLoading ||
								isInsightsFetching
							}
							onClick={handleRefetch}
							size="icon"
							variant="secondary"
						>
							<ArrowClockwiseIcon
								aria-hidden
								className={cn(
									"size-4",
									isLoading ||
										isFetching ||
										isPulseFetching ||
										isInsightsFetching
										? "animate-spin"
										: ""
								)}
							/>
						</Button>
						<Button
							className={cn(
								"gap-2 px-3 py-2 font-medium sm:px-4 sm:py-2",
								"bg-linear-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary",
								"group relative overflow-hidden shadow-lg transition-all duration-300 hover:shadow-xl"
							)}
							onClick={() => setDialogOpen(true)}
							size="default"
						>
							<div className="absolute inset-0 -translate-x-full bg-linear-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
							<PlusIcon className="relative z-10 size-4 transition-transform duration-300 group-hover:rotate-90" />
							<span className="relative z-10 truncate">New Website</span>
						</Button>
					</>
				}
				title="Overview"
			/>

			<div
				aria-busy={isFetching || isPulseFetching || isInsightsFetching}
				className="flex-1 space-y-6 overflow-y-auto p-3 sm:p-4 lg:p-6"
			>
				{/* Summary Stats */}
				<SummaryStats
					activeMonitors={activeMonitors}
					averageTrend={averageTrend}
					isLoading={isLoading || isPulseLoading}
					pulseHealthPercentage={healthPercentage}
					totalActiveUsers={totalActiveUsers}
					totalMonitors={totalMonitors}
					totalViews={totalViews}
					trendDirection={trendDirection}
					websiteCount={websiteCount}
				/>

				<div className="grid gap-6 lg:grid-cols-2">
					<SmartInsightsSection
						insights={insights}
						isLoading={isLoading || isInsightsLoading}
					/>
					<MonitorsSection
						activeMonitors={activeMonitors}
						isLoading={isPulseLoading}
						monitors={monitors}
						totalMonitors={totalMonitors}
					/>
				</div>

				{/* Websites Section */}
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold text-foreground">Your Websites</h2>
						{websites.length > 0 && (
							<Link
								className="text-muted-foreground text-sm hover:text-foreground"
								href="/websites"
							>
								View all
							</Link>
						)}
					</div>

					{isLoading && (
						<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
							{[1, 2, 3].map((num) => (
								<WebsiteCardSkeleton key={`skeleton-${num}`} />
							))}
						</div>
					)}

					{isError && (
						<EmptyState
							action={{
								label: "Try Again",
								onClick: handleRefetch,
							}}
							description="There was an issue fetching your websites."
							icon={<GlobeIcon />}
							title="Failed to load"
							variant="error"
						/>
					)}

					{!(isLoading || isError) && websites.length === 0 && (
						<EmptyState
							action={{
								label: "Create Your First Website",
								onClick: () => setDialogOpen(true),
							}}
							description="Start tracking your website analytics by adding your first website."
							icon={<GlobeIcon weight="duotone" />}
							title="No websites yet"
							variant="minimal"
						/>
					)}

					{!(isLoading || isError) && websites.length > 0 && (
						<div
							aria-live="polite"
							className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
						>
							{websites.slice(0, 6).map((website) => (
								<WebsiteCard
									activeUsers={activeUsers?.[website.id]}
									chartData={chartData?.[website.id]}
									isLoadingChart={isFetching}
									key={website.id}
									website={website}
								/>
							))}
						</div>
					)}

					{!isLoading && websites.length > 6 && (
						<div className="flex justify-center pt-2">
							<Button asChild variant="outline">
								<Link href="/websites">
									View all {websites.length} websites
								</Link>
							</Button>
						</div>
					)}
				</div>
			</div>

			<WebsiteDialog onOpenChange={setDialogOpen} open={dialogOpen} />
		</div>
	);
}
