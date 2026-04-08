"use client";

import { CheckCircle } from "@phosphor-icons/react/dist/ssr/CheckCircle";
import { Warning } from "@phosphor-icons/react/dist/ssr/Warning";
import { WarningCircle } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import { FaviconImage } from "@/components/analytics/favicon-image";
import { Skeleton } from "@/components/ui/skeleton";
import { useWebsites } from "@/hooks/use-websites";
import { cn } from "@/lib/utils";
import { useInsightsFeed } from "../hooks/use-insights-feed";
import { deriveSiteHealth, type SiteHealthStatus } from "../lib/site-health";

const STATUS_STYLES: Record<
	SiteHealthStatus,
	{ ring: string; label: string; iconClass: string; weight: "fill" | "duotone" }
> = {
	healthy: {
		ring: "",
		label: "Healthy",
		iconClass: "text-emerald-500",
		weight: "fill",
	},
	attention: {
		ring: "ring-1 ring-amber-500/40",
		label: "Attention",
		iconClass: "text-amber-500",
		weight: "duotone",
	},
	degraded: {
		ring: "ring-1 ring-red-500/50",
		label: "Degraded",
		iconClass: "text-red-500",
		weight: "duotone",
	},
};

function StatusIcon({
	status,
	className,
}: {
	status: SiteHealthStatus;
	className?: string;
}) {
	const style = STATUS_STYLES[status];
	const props = {
		"aria-label": style.label,
		className: cn("size-4 shrink-0", style.iconClass, className),
		weight: style.weight,
	} as const;

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
			<section aria-label="Site health" className="border-b px-4 py-4 sm:px-6">
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
		return { site, health };
	});

	return (
		<section aria-label="Site health" className="border-b px-4 py-4 sm:px-6">
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

			<div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{isLoading &&
					Array.from(
						{ length: (websites?.length ?? 0) > 0 ? websites.length : 4 },
						(_, i) => (
							<Skeleton
								className="h-[68px] w-full rounded"
								key={`site-skeleton-${i}`}
							/>
						)
					)}
				{!isLoading &&
					tiles.map(({ site, health }) => {
						const style = STATUS_STYLES[health.status];
						return (
							<Link
								className={cn(
									"group flex items-center gap-3 rounded border bg-card px-3 py-2.5 transition-colors hover:bg-accent",
									style.ring
								)}
								href={`/websites/${site.id}`}
								key={site.id}
							>
								<FaviconImage
									className="shrink-0 rounded"
									domain={site.domain}
									size={32}
								/>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-foreground text-sm">
										{site.name ?? site.domain}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{health.reason ?? "No issues"}
									</p>
								</div>
								<StatusIcon status={health.status} />
							</Link>
						);
					})}
			</div>
		</section>
	);
}
