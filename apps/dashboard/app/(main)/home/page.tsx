"use client";

import { ArrowClockwiseIcon, GlobeIcon, PlusIcon } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { WebsiteDialog } from "@/components/website-dialog";
import { useGlobalAnalytics } from "@/hooks/use-global-analytics";
import { usePulseStatus } from "@/hooks/use-pulse-status";
import { useSmartInsights } from "@/hooks/use-smart-insights";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { MonitorsSection } from "./_components/monitors-section";
import {
  OverviewWebsiteCard,
  OverviewWebsiteCardSkeleton,
} from "./_components/overview-website-card";
import { SmartInsightsSection } from "./_components/smart-insights-section";
import { SummaryStats } from "./_components/summary-stats";

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
      <div className="flex h-16 items-center justify-between border-b bg-background px-6">
        <h1 className="font-medium text-base text-foreground">Overview</h1>
        <div className="flex items-center gap-2">
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
                isLoading || isFetching || isPulseFetching || isInsightsFetching
                  ? "animate-spin"
                  : "",
              )}
            />
          </Button>
          <Button
            className="gap-2 font-mono text-sm"
            onClick={() => setDialogOpen(true)}
          >
            <PlusIcon className="size-4" />
            NEW WEBSITE
          </Button>
        </div>
      </div>

      <div
        aria-busy={isFetching || isPulseFetching || isInsightsFetching}
        className="flex-1 space-y-5 overflow-y-auto p-6"
      >
        {/* Your Websites */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-base text-foreground">
              Your websites
            </h2>
            {websites.length > 0 && (
              <Link className="text-muted-foreground text-sm" href="/websites">
                View all
              </Link>
            )}
          </div>

          {isLoading && (
            <div className="grid gap-5 lg:grid-cols-3">
              {[1, 2, 3].map((num) => (
                <OverviewWebsiteCardSkeleton key={`skeleton-${num}`} />
              ))}
            </div>
          )}

          {!(isLoading || isError) && websites.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-3">
              {websites
                .slice(0, 3)
                .map((website: (typeof websites)[number]) => (
                  <OverviewWebsiteCard
                    activeUsers={activeUsers?.[website.id]}
                    chartData={chartData?.[website.id]}
                    isLoadingChart={isFetching}
                    key={website.id}
                    website={website}
                  />
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
        </section>

        {/* Analytics */}
        <section className="space-y-4">
          <h2 className="font-medium text-base text-foreground">Analytics</h2>
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
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <SmartInsightsSection
            insights={insights}
            isLoading={isLoading || isInsightsLoading}
            websiteCount={websiteCount}
          />
          <MonitorsSection
            activeMonitors={activeMonitors}
            isLoading={isPulseLoading}
            monitors={monitors}
            totalMonitors={totalMonitors}
            websiteCount={websiteCount}
          />
        </section>
      </div>

      <WebsiteDialog onOpenChange={setDialogOpen} open={dialogOpen} />
    </div>
  );
}
