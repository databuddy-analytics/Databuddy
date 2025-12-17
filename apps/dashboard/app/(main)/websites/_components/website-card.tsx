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
import { memo } from "react";
import { FaviconImage } from "@/components/analytics/favicon-image";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import MiniChart from "./mini-chart";

type WebsiteCardProps = {
	website: Website;
	chartData?: ProcessedMiniChartData;
	activeUsers?: number;
	isLoadingChart?: boolean;
};

function TrendStat({
	trend,
	className = "flex items-center gap-1 font-semibold text-xs",
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
					weight="fill"
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
					weight="fill"
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

export const WebsiteCard = memo(
	({ website, chartData, activeUsers, isLoadingChart }: WebsiteCardProps) => (
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
				<CardHeader className="dotted-bg relative gap-0! border-b bg-accent px-0 pt-4 pb-0!">
					{activeUsers !== undefined && activeUsers > 0 && (
						<div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 font-medium text-success text-xs tabular-nums backdrop-blur-sm">
							<span className="relative flex size-1.5">
								<span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
								<span className="relative inline-flex size-1.5 rounded-full bg-success" />
							</span>
							{activeUsers}
						</div>
					)}
					{isLoadingChart ? (
						<div className="px-3">
							<Skeleton className="mx-auto h-24 w-full rounded sm:h-28" />
						</div>
					) : chartData ? (
						chartData.data.length > 0 ? (
							<div className="h-28 space-y-2">
								<div className="h-full duration-300 [--chart-color:var(--color-primary)] motion-reduce:transition-none group-hover:[--chart-color:theme(colors.primary.600)]">
									<MiniChart
										data={chartData.data}
										days={chartData.data.length}
										id={website.id}
									/>
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
								<CardTitle className="truncate font-semibold text-sm leading-tight">
									{website.name}
								</CardTitle>
								<CardDescription className="truncate text-muted-foreground text-xs">
									{website.domain}
								</CardDescription>
							</div>
							{chartData && (
								<div className="flex shrink-0 flex-col items-end space-y-0.5">
									<span className="flex items-center gap-1 font-semibold text-foreground text-xs tabular-nums">
										<EyeIcon
											className="size-4 shrink-0 text-muted-foreground"
											weight="duotone"
										/>
										{formatNumber(chartData.totalViews)}
									</span>
									<TrendStat
										className="flex items-center gap-1 font-semibold text-xs"
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
			<CardHeader className="dotted-bg gap-0! border-b bg-accent px-0 pt-4 pb-0!">
				<Skeleton className="h-28 w-full" />
			</CardHeader>
			<CardContent className="space-y-1 px-4 py-3">
				<div className="flex items-center gap-3">
					<Skeleton className="size-7 shrink-0 rounded" />
					<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
						<div className="min-w-0 space-y-0.5">
							<Skeleton className="h-4 w-24 rounded" />
							<Skeleton className="h-3.5 w-32 rounded" />
						</div>
						<div className="flex shrink-0 flex-col items-end space-y-0.5">
							<Skeleton className="h-4 w-10 rounded" />
							<Skeleton className="h-4 w-12 rounded" />
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
