"use client";

import Link from "next/link";
import { useState } from "react";
import { TopBar } from "@/components/layout/top-bar";
import { WebsiteDialog } from "@/components/website-dialog";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { WebsiteCard } from "../websites/_components/website-card";
import { MonitorsSection } from "./_components/monitors-section";
import { SmartInsightsSection } from "./_components/smart-insights-section";
import { SummaryStats } from "./_components/summary-stats";
import { useGlobalAnalytics } from "./hooks/use-global-analytics";
import { usePulseStatus } from "./hooks/use-pulse-status";
import { useSmartInsights } from "./hooks/use-smart-insights";
import { ArrowClockwiseIcon, GlobeIcon, PlusIcon } from "@databuddy/ui/icons";
import { Button, Card, EmptyState, Skeleton } from "@databuddy/ui";

const WEBSITE_PREVIEW_LIMIT = 3;

function WebsiteCardSkeleton() {
	return (
		<Card className="animate-pulse overflow-hidden pt-0">
			<Card.Header className="dotted-bg gap-0! border-b bg-accent px-3 pt-4 pb-0!">
				<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
			</Card.Header>
			<Card.Content className="px-4 py-3">
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
			</Card.Content>
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
		isRefreshing: isInsightsRefreshing,
		isFetching: isInsightsFetching,
		isFetchingFresh: isInsightsFetchingFresh,
		isError: isInsightsError,
		refetch: refetchInsights,
	} = useSmartInsights();

	const handleRefetch = async () => {
		await Promise.all([
			refetchWebsites(),
			refetchMonitors(),
			refetchInsights(),
		]);
	};

	const websitePreview = websites.slice(0, WEBSITE_PREVIEW_LIMIT);
	const hasMoreWebsites = websites.length > WEBSITE_PREVIEW_LIMIT;

	return (
		<div className="flex h-full flex-col">
			<TopBar.Title>
				<h1 className="font-semibold text-sm">Home</h1>
			</TopBar.Title>
			<TopBar.Actions>
				<Button
					aria-label="Refresh data"
					disabled={
						isLoading ||
						isFetching ||
						isPulseLoading ||
						isPulseFetching ||
						isInsightsLoading
					}
					onClick={handleRefetch}
					size="sm"
					variant="secondary"
				>
					<ArrowClockwiseIcon
						aria-hidden
						className={cn(
							"size-4 shrink-0",
							(isLoading ||
								isFetching ||
								isPulseFetching ||
								isInsightsRefreshing) &&
								"animate-spin"
						)}
					/>
				</Button>
				<Button onClick={() => setDialogOpen(true)} size="sm">
					<PlusIcon className="size-4 shrink-0" />
					New Website
				</Button>
			</TopBar.Actions>

			<div
				aria-busy={
					isFetching ||
					isPulseFetching ||
					isInsightsLoading ||
					isInsightsRefreshing
				}
				className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-5"
			>
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

				<div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
					<SmartInsightsSection
						insights={insights}
						isError={isInsightsError}
						isFetching={isInsightsFetching}
						isFetchingFresh={isInsightsFetchingFresh}
						isLoading={isInsightsLoading}
						onRefreshAction={refetchInsights}
					/>
					<MonitorsSection
						activeMonitors={activeMonitors}
						isLoading={isPulseLoading}
						monitors={monitors}
						totalMonitors={totalMonitors}
					/>
				</div>

				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold text-foreground text-sm">
							Website Snapshot
						</h2>
						{websites.length > 0 && (
							<Link
								className="text-muted-foreground text-xs hover:text-foreground"
								href="/websites"
							>
								View all
							</Link>
						)}
					</div>

					{isLoading && (
						<div className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
							{Array.from({ length: WEBSITE_PREVIEW_LIMIT }, (_, i) => (
								<WebsiteCardSkeleton key={`skeleton-${i + 1}`} />
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
							className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
						>
							{websitePreview.map((website) => (
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

					{!isLoading && hasMoreWebsites && (
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
