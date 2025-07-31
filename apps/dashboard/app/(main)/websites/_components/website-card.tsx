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
				className="group block"
				data-section="website-grid"
				data-track="website-card-click"
				data-website-id={website.id}
				data-website-name={website.name}
				href={`/websites/${website.id}`}
			>
				<Card className="flex h-full select-none flex-col bg-background transition-all duration-300 ease-in-out group-hover:border-primary/60 group-hover:shadow-primary/5 group-hover:shadow-xl">
					<CardHeader className="pb-2">
						<div className="flex items-center justify-between">
							<div className="min-w-0 flex-1">
								<CardTitle className="truncate font-bold text-base transition-colors group-hover:text-primary">
									{website.name}
								</CardTitle>
								<CardDescription className="flex items-center gap-1 pt-0.5">
									<FaviconImage
										altText={`${website.name} favicon`}
										className="flex-shrink-0"
										domain={website.domain}
										size={24}
									/>
									<span className="truncate text-xs">{website.domain}</span>
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
								<Skeleton className="h-12 w-full rounded" />
							</div>
						) : chartData ? (
							chartData.data.length > 0 ? (
								<div className="space-y-2">
									<div className="flex items-center justify-between">
										<span className="font-medium text-muted-foreground text-xs">
											{formatNumber(chartData.totalViews)} views
										</span>
										{chartData.trend && (
											<div className="flex items-center gap-1 font-medium text-xs">
												{chartData.trend.type === 'up' ? (
													<>
														<TrendUpIcon
															aria-hidden="true"
															className="!text-success h-4 w-4"
															style={{ color: 'var(--tw-success, #22c55e)' }}
															weight="fill"
														/>
														<span
															className="!text-success"
															style={{ color: 'var(--tw-success, #22c55e)' }}
														>
															+{chartData.trend.value.toFixed(0)}%
														</span>
													</>
												) : chartData.trend.type === 'down' ? (
													<>
														<TrendDownIcon
															aria-hidden="true"
															className="!text-destructive h-4 w-4"
															style={{
																color: 'var(--tw-destructive, #ef4444)',
															}}
															weight="fill"
														/>
														<span
															className="!text-destructive"
															style={{
																color: 'var(--tw-destructive, #ef4444)',
															}}
														>
															-{chartData.trend.value.toFixed(0)}%
														</span>
													</>
												) : (
													<>
														<MinusIcon
															aria-hidden="true"
															className="h-4 w-4 text-muted-foreground"
															weight="fill"
														/>
														<span className="text-muted-foreground">0%</span>
													</>
												)}
											</div>
										)}
									</div>
									<div className="transition-colors duration-300 [--chart-color:theme(colors.primary.DEFAULT)] group-hover:[--chart-color:theme(colors.primary.600)]">
										<Suspense
											fallback={<Skeleton className="h-12 w-full rounded" />}
										>
											<MiniChart data={chartData.data} id={website.id} />
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
				<Skeleton className="h-6 w-3/4 rounded-md" />
				<Skeleton className="mt-1 h-4 w-1/2 rounded-md" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-20 w-full rounded-md" />
			</CardContent>
		</Card>
	);
}
