"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { TrendDown } from "@phosphor-icons/react/dist/ssr/TrendDown";
import { TrendUp } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsites } from "@/hooks/use-websites";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { useInsightsFeed } from "../hooks/use-insights-feed";
import { deriveSiteHealth, type SiteHealthStatus } from "../lib/site-health";

const STATUS_STYLES: Record<
	SiteHealthStatus,
	{
		ring: string;
		label: string;
		iconClass: string;
		pillBg: string;
		pillText: string;
	}
> = {
	healthy: {
		ring: "",
		label: "Healthy",
		iconClass: "text-emerald-500",
		pillBg: "bg-emerald-500/10",
		pillText: "text-emerald-600",
	},
	attention: {
		ring: "border-amber-500/40",
		label: "Attention",
		iconClass: "text-amber-500",
		pillBg: "bg-amber-500/10",
		pillText: "text-amber-600",
	},
	degraded: {
		ring: "border-red-500/50",
		label: "Degraded",
		iconClass: "text-red-500",
		pillBg: "bg-red-500/10",
		pillText: "text-red-600",
	},
};

function StatusIcon({ status }: { status: SiteHealthStatus }) {
	const style = STATUS_STYLES[status];
	const props = {
		"aria-label": style.label,
		className: cn("size-4 shrink-0", style.iconClass),
		weight: "fill" as const,
	};
	if (status === "healthy") {
		return <CheckCircle {...props} />;
	}
	if (status === "attention") {
		return <Warning {...props} />;
	}
	return <WarningCircle {...props} />;
}

export function SiteHealthGrid() {
	const {
		websites,
		chartData,
		activeUsers,
		isLoading: websitesLoading,
		isError: websitesError,
		refetch: websitesRefetch,
	} = useWebsites();
	const {
		insights,
		isLoading: insightsLoading,
		isError: insightsError,
		refetch: insightsRefetch,
	} = useInsightsFeed();
	const isLoading = websitesLoading || insightsLoading;
	const isError = websitesError || insightsError;

	const handleRetry = () => {
		websitesRefetch();
		insightsRefetch();
	};

	if (!isLoading && isError) {
		return (
			<section aria-label="Site health" className="border-b px-4 py-5 sm:px-6">
				<div className="flex items-center gap-3">
					<p className="text-muted-foreground text-sm">
						Couldn't load site health
					</p>
					<button
						className="inline-flex items-center gap-1 rounded text-primary text-xs transition-colors hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						onClick={handleRetry}
						type="button"
					>
						Retry
					</button>
				</div>
			</section>
		);
	}

	if (!isLoading && (!websites || websites.length === 0)) {
		return null;
	}

	const counts = { healthy: 0, attention: 0, degraded: 0 };

	const tiles = (websites ?? []).map((site) => {
		const health = deriveSiteHealth(site.id, insights);
		counts[health.status] += 1;
		const chart = chartData?.[site.id];
		const active = activeUsers?.[site.id] ?? 0;
		return { site, health, chart, active };
	});

	return (
		<section aria-label="Site health" className="border-b px-4 py-5 sm:px-6">
			<div className="mb-3 flex items-center justify-between">
				<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
					Sites · {tiles.length}
				</span>
				{!isLoading && (
					<span className="text-[11px] text-muted-foreground">
						{counts.healthy} healthy · {counts.attention} attention ·{" "}
						{counts.degraded} degraded
					</span>
				)}
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{isLoading &&
					Array.from(
						{ length: (websites?.length ?? 0) > 0 ? websites.length : 3 },
						(_, i) => (
							<Skeleton
								className="h-[112px] w-full rounded"
								key={`site-skeleton-${i}`}
							/>
						)
					)}
				{!isLoading &&
					tiles.map(({ site, health, chart, active }) => {
						const style = STATUS_STYLES[health.status];
						const trend = chart?.trend;
						const TrendIconComponent = trend
							? trend.type === "down"
								? TrendDown
								: TrendUp
							: null;
						return (
							<Link
								className={cn(
									"group flex flex-col gap-3 rounded border bg-card p-4 transition-colors hover:bg-accent",
									style.ring
								)}
								href={`/websites/${site.id}`}
								key={site.id}
							>
								<div className="flex items-center gap-3">
									<FaviconImage
										className="shrink-0 rounded"
										domain={site.domain}
										size={40}
									/>
									<div className="min-w-0 flex-1">
										<p className="truncate font-semibold text-foreground text-sm">
											{site.name ?? site.domain}
										</p>
										<p className="truncate text-muted-foreground text-xs">
											{site.domain}
										</p>
									</div>
									<StatusIcon status={health.status} />
								</div>

								<div className="flex items-end justify-between gap-3">
									<div className="min-w-0 flex-1">
										<div className="flex items-baseline gap-2">
											<span className="font-semibold text-foreground text-xl tabular-nums">
												{formatNumber(chart?.totalViews ?? 0)}
											</span>
											<span className="text-[11px] text-muted-foreground">
												views · 7d
											</span>
										</div>
										<div className="mt-1 flex items-center gap-1.5">
											{trend && TrendIconComponent && (
												<span
													className={cn(
														"flex items-center gap-0.5 font-medium text-[11px] tabular-nums",
														trend.type === "up" && "text-emerald-600",
														trend.type === "down" && "text-red-500",
														trend.type === "neutral" && "text-muted-foreground"
													)}
												>
													<TrendIconComponent
														className="size-3"
														weight="fill"
													/>
													{trend.value.toFixed(0)}%
												</span>
											)}
											{active > 0 && (
												<span className="flex items-center gap-1 text-[11px] text-muted-foreground">
													<span className="relative flex size-1.5">
														<span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
														<span className="relative inline-flex size-1.5 rounded-full bg-success" />
													</span>
													{active} live
												</span>
											)}
										</div>
									</div>
									{health.reason && (
										<span
											className={cn(
												"shrink-0 truncate rounded px-2 py-1 font-medium text-[11px]",
												style.pillBg,
												style.pillText
											)}
											title={health.reason}
										>
											{health.reason}
										</span>
									)}
								</div>
							</Link>
						);
					})}
			</div>
		</section>
	);
}
