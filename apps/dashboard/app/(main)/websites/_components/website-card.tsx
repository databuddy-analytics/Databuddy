import type { ProcessedMiniChartData, Website } from '@databuddy/shared';
import {
	ArrowRightIcon,
	MinusIcon,
	TrendDownIcon,
	TrendUpIcon,
} from '@phosphor-icons/react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, Suspense } from 'react';
import { FaviconImage } from '@/components/analytics/favicon-image';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface WebsiteCardProps {
	website: Website;
	chartData?: ProcessedMiniChartData;
	isLoadingChart?: boolean;
}

function TrendStat({
	trend,
	className = 'flex items-center gap-1 font-medium text-xs sm:text-sm',
}: {
	trend: ProcessedMiniChartData['trend'] | undefined;
	className?: string;
}) {
	if (!trend) {
		return null;
	}
	if (trend.type === 'up') {
		return (
			<div className={className}>
				<TrendUpIcon
					aria-hidden="true"
					className="!text-success h-4 w-4"
					style={{ color: 'var(--tw-success, #22c55e)' }}
					weight="duotone"
				/>
				<span
					className="!text-success"
					style={{ color: 'var(--tw-success, #22c55e)' }}
				>
					+{trend.value.toFixed(0)}%
				</span>
			</div>
		);
	}
	if (trend.type === 'down') {
		return (
			<div className={className}>
				<TrendDownIcon
					aria-hidden
					className="!text-destructive h-4 w-4"
					style={{ color: 'var(--tw-destructive, #ef4444)' }}
					weight="duotone"
				/>
				<span
					className="!text-destructive"
					style={{ color: 'var(--tw-destructive, #ef4444)' }}
				>
					-{trend.value.toFixed(0)}%
				</span>
			</div>
		);
	}
	return (
		<div className={className}>
			<MinusIcon
				aria-hidden
				className="h-4 w-4 text-muted-foreground"
				weight="fill"
			/>
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
	() => import('./mini-chart').then((mod) => mod.default),
	{
		loading: () => <Skeleton className="h-12 w-full rounded" />,
		ssr: false,
	}
);

export const WebsiteCard = memo(
	({ website, chartData, isLoadingChart }: WebsiteCardProps) => {
		return (
			<Link
				aria-label={`Open ${website.name} analytics`}
				className="group block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
				data-section="website-grid"
				data-track="website-card-click"
				data-website-id={website.id}
				data-website-name={website.name}
				href={`/websites/${website.id}`}
			>
				<Card className="flex h-full select-none flex-col overflow-hidden bg-background transition-all duration-300 ease-in-out group-hover:border-primary/60 group-hover:shadow-primary/5 group-hover:shadow-xl motion-reduce:transform-none motion-reduce:transition-none">
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between gap-2">
							<div className="min-w-0 flex-1">
								<CardTitle className="truncate font-bold text-base leading-tight transition-colors group-hover:text-primary sm:text-lg">
									{website.name}
								</CardTitle>
								<CardDescription className="flex items-center gap-1 pt-0.5">
									<FaviconImage
										altText={`${website.name} favicon`}
										className="flex-shrink-0"
										domain={website.domain}
										size={24}
									/>
									<span className="truncate text-xs sm:text-sm">
										{website.domain}
									</span>
								</CardDescription>
							</div>
							<ArrowRightIcon
								aria-hidden="true"
								className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-all duration-200 group-hover:translate-x-1 group-hover:text-primary"
								weight="fill"
							/>
						</div>
					</CardHeader>

					<CardContent className="pt-0 pb-3">
						{isLoadingChart ? (
							<div className="space-y-2">
								<div className="flex justify-between">
									<Skeleton className="h-3 w-12 rounded" />
									<Skeleton className="h-3 w-8 rounded" />
								</div>
								<Skeleton className="h-12 w-full rounded sm:h-16" />
							</div>
						) : chartData ? (
							chartData.data.length > 0 ? (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="font-medium text-muted-foreground text-xs sm:text-sm">
											{formatNumber(chartData.totalViews)} views
										</span>
										<TrendStat trend={chartData.trend} />
									</div>
									<div className="transition-colors duration-300 [--chart-color:theme(colors.primary.DEFAULT)] motion-reduce:transition-none group-hover:[--chart-color:theme(colors.primary.600)]">
										<Suspense
											fallback={
												<Skeleton className="h-12 w-full rounded sm:h-16" />
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
								<div className="py-4 text-center text-muted-foreground text-xs">
									No data yet
								</div>
							)
						) : (
							<div className="py-4 text-center text-muted-foreground text-xs">
								Failed to load
							</div>
						)}
					</CardContent>
				</Card>
			</Link>
		);
	}
);

WebsiteCard.displayName = 'WebsiteCard';

export function WebsiteCardSkeleton() {
	return (
		<Card className="h-full">
			<CardHeader>
				<Skeleton className="h-6 w-3/4 rounded" />
				<Skeleton className="mt-1 h-4 w-1/2 rounded" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-20 w-full rounded sm:h-24" />
			</CardContent>
		</Card>
	);
}
