"use client";

import type {
  ProcessedMiniChartData,
  Website,
} from "@databuddy/shared/types/website";
import {
  EyeIcon,
  MinusIcon,
  TrendDownIcon,
  TrendUpIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { memo } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import MiniChart from "../../websites/_components/mini-chart";

interface OverviewWebsiteCardProps {
  website: Website;
  chartData?: ProcessedMiniChartData;
  activeUsers?: number;
  isLoadingChart?: boolean;
}

function formatNumber(num: number) {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

function StatBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-xs font-semibold leading-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

function getTrendVisual(trend: ProcessedMiniChartData["trend"] | undefined) {
  if (trend?.type === "up") {
    return {
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
      Icon: TrendUpIcon,
      sign: "+",
      chartColor: "#22c55e",
    };
  }

  if (trend?.type === "down") {
    return {
      color: "text-red-500",
      bg: "bg-red-500/10",
      Icon: TrendDownIcon,
      sign: "-",
      chartColor: "#ef4444",
    };
  }

  return {
    color: "text-foreground",
    bg: "bg-muted",
    Icon: MinusIcon,
    sign: "",
    chartColor: "#737373",
  };
}

export const OverviewWebsiteCard = memo(
  ({
    website,
    chartData,
    activeUsers,
    isLoadingChart,
  }: OverviewWebsiteCardProps) => {
    const trendVisual = getTrendVisual(chartData?.trend);
    const totalViews = chartData ? chartData.totalViews : 0;
    const trendValue = chartData?.trend?.value ?? 0;

    return (
      <Link
        aria-label={`Open ${website.name} analytics`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        href={`/websites/${website.id}`}
      >
        <Card className="overflow-hidden border bg-background gap-0 p-0">
          <CardHeader className="relative block border-b bg-muted/25 p-0 [.border-b]:pb-0">
            <div className="absolute left-4 top-4 z-10 flex items-center gap-2">
              <StatBadge className="border-transparent bg-muted text-foreground">
                <EyeIcon className="size-3" weight="duotone" />
                <span className="tabular-nums">{formatNumber(totalViews)}</span>
              </StatBadge>
              <StatBadge
                className={cn(
                  "border-transparent",
                  trendVisual.bg,
                  trendVisual.color,
                )}
              >
                <trendVisual.Icon className="size-3" weight="fill" />
                <span className="tabular-nums">
                  {trendVisual.sign}
                  {trendValue.toFixed(0)}%
                </span>
              </StatBadge>
            </div>

            {activeUsers !== undefined && activeUsers > 0 && (
              <div className="absolute right-4 top-4 z-10 inline-flex items-center gap-1 border border-transparent bg-emerald-500/10 px-2 py-0.5 font-mono text-emerald-600 text-xs leading-none">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex size-1.5 bg-emerald-500" />
                </span>
                <span className="tabular-nums">{activeUsers}</span>
              </div>
            )}

            <div
              className="relative h-36"
              style={
                {
                  "--chart-color": trendVisual.chartColor,
                } as CSSProperties
              }
            >
              {isLoadingChart ? (
                <div className="absolute inset-x-0 bottom-0 px-4">
                  <Skeleton className="h-28 w-full" />
                </div>
              ) : chartData ? (
                <div className="absolute inset-x-0 bottom-0">
                  <MiniChart
                    data={chartData.data}
                    days={chartData.data.length}
                    id={website.id}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  No data
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <FaviconImage
                altText={`${website.name} favicon`}
                className="shrink-0"
                domain={website.domain}
                size={48}
              />
              <div className="min-w-0 space-y-1.5">
                <p className="truncate font-medium text-base leading-none text-foreground">
                  {website.name}
                </p>
                <p className="truncate text-muted-foreground text-sm leading-none">
                  {website.domain}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </Link>
    );
  },
);

OverviewWebsiteCard.displayName = "OverviewWebsiteCard";

export function OverviewWebsiteCardSkeleton() {
  return (
    <Card className="overflow-hidden border bg-background gap-0 p-0">
      <CardHeader className="relative block border-b bg-muted/25 p-0">
        <div className="relative h-36">
          <div className="absolute inset-x-0 bottom-0 px-4">
            <Skeleton className="h-28 w-full" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-12 shrink-0" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
