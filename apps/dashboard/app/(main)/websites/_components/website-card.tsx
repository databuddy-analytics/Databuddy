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
import dynamic from "next/dynamic";
import Link from "next/link";
import { memo, Suspense } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type WebsiteCardProps = {
	website: Website;
	chartData?: ProcessedMiniChartData;
	isLoadingChart?: boolean;
};

function TrendStat({
	trend,
	className = "flex items-center gap-1 font-medium text-xs",
}: {
	trend: ProcessedMiniChartData["trend"] | undefined;
	className?: string;
}) {
	if (!trend) {
		return null;
	}
	if (trend.type === "up") {
		return (
			<div className={className}>
				<TrendUpIcon
					aria-hidden="true"
					className="size-4 text-success"
					weight="duotone"
				/>
				<span className="text-success">+{trend.value.toFixed(0)}%</span>
			</div>
		);
	}
	if (trend.type === "down") {
		return (
			<div className={className}>
				<TrendDownIcon
					aria-hidden
					className="size-4 text-destructive"
					weight="duotone"
				/>
				<span className="text-destructive">-{trend.value.toFixed(0)}%</span>
			</div>
		);
	}
	return (
		<div className={className}>
			<MinusIcon aria-hidden className="size-4 text-muted-foreground" />
			<span className="text-muted-foreground">0%</span>
		</div>
	);
}

const formatNumber = (num: number) => {
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
};

// Lazy load the chart component to improve initial page load
const MiniChart = dynamic(
	() => import("./mini-chart").then((mod) => mod.default),
	{
		loading: () => <Skeleton className="h-28 w-full rounded" />,
		ssr: false,
	}
);

export const WebsiteCard = memo(
	({ website, chartData, isLoadingChart }: WebsiteCardProps) => (
		<Link
			aria-label={`Open ${website.name} analytics`}
			className="group block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			data-section="website-grid"
			data-track="website-card-click"
			data-website-id={website.id}
			data-website-name={website.name}
			href={`/websites/${website.id}`}
		>
			<Card className="flex h-full select-none flex-col gap-0 overflow-hidden bg-background p-0 transition-all duration-300 ease-in-out group-hover:border-primary/60 group-hover:shadow-primary/5 group-hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none">
				<CardHeader className="dotted-bg gap-0! border-b bg-accent-brighter/80 px-0 pt-4 pb-0!">
					{isLoadingChart ? (
						<div className="px-3">
							<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
						</div>
					) : chartData ? (
						chartData.data.length > 0 ? (
							<div className="h-28 space-y-2">
								<div className="h-full transition-colors duration-300 [--chart-color:var(--color-primary)] motion-reduce:transition-none group-hover:[--chart-color:theme(colors.primary.600)]">
									<Suspense
										fallback={
											<Skeleton className="h-24 w-full rounded sm:h-28" />
										}
									>
										<MiniChart
											data={chartData.data}
											days={chartData.data.length}
											id={website.id}
										/>
									</Suspense>
								</div>
							</div>
						) : (
							<div className="py-8 text-center text-muted-foreground text-xs">
								No data yet
							</div>
						)
					) : (
						<div className="py-8 text-center text-muted-foreground text-xs">
							Failed to load
						</div>
					)}
				</CardHeader>
				<CardContent className="space-y-1 px-4 py-3">
					<div className="flex items-center gap-3">
						<FaviconImage
							altText={`${website.name} favicon`}
							className="shrink-0"
							domain={website.domain}
							size={28}
						/>
						<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
							<div className="min-w-0 space-y-0.5">
								<CardTitle className="truncate font-medium text-sm leading-tight">
									{website.name}
								</CardTitle>
								<CardDescription className="truncate text-muted text-xs">
									{website.domain}
								</CardDescription>
							</div>
							{chartData && (
								<div className="flex shrink-0 flex-col items-end space-y-0.5">
									<span className="flex items-center gap-1 font-medium text-muted text-xs">
										<EyeIcon
											className="size-3 shrink-0 text-muted"
											weight="duotone"
										/>
										{formatNumber(chartData.totalViews)}
									</span>
									<TrendStat
										className="flex items-center gap-0.5 font-medium text-[10px]"
										trend={chartData.trend}
									/>
								</div>
							)}
						</div>
					</div>
				</CardContent>
			</Card>
		</Link>
	)
);

WebsiteCard.displayName = "WebsiteCard";

export function WebsiteCardSkeleton() {
	return (
		<Card className="h-full overflow-hidden pt-0">
			<CardHeader className="dotted-bg gap-0! border-b bg-accent-brighter/80 px-3 pt-4 pb-0!">
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
