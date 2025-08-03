'use client';

import { ArrowClockwise, Target, TrendUp, Users } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface GoalAnalyticsProps {
	isLoading: boolean;
	error: Error | null;
	data: any;
	summaryStats: {
		totalUsers: number;
		conversionRate: number;
		completions: number;
	};
	onRetry: () => void;
}

export function GoalAnalytics({
	isLoading,
	error,
	data,
	summaryStats,
	onRetry,
}: GoalAnalyticsProps) {
	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
					{[...new Array(3)].map((_, i) => (
						<Card className="animate-pulse rounded" key={i}>
							<CardContent className="p-6">
								<div className="mb-2 h-4 w-24 rounded bg-muted" />
								<div className="h-8 w-16 rounded bg-muted" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<Card className="rounded border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
				<CardContent className="pt-6">
					<div className="flex items-center justify-between">
						<div>
							<p className="font-medium text-red-600">
								Failed to load goal analytics
							</p>
							<p className="mt-1 text-red-600/80 text-sm">{error.message}</p>
						</div>
						<Button
							className="gap-2"
							onClick={onRetry}
							size="sm"
							variant="outline"
						>
							<ArrowClockwise size={16} weight="duotone" />
							Retry
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!(data?.success && data.data)) {
		return (
			<Card className="rounded">
				<CardContent className="p-6">
					<p className="text-center text-muted-foreground">
						No analytics data available
					</p>
				</CardContent>
			</Card>
		);
	}

	const formatNumber = (num: number) => {
		if (num >= 1_000_000) {
			return `${(num / 1_000_000).toFixed(1)}M`;
		}
		if (num >= 1000) {
			return `${(num / 1000).toFixed(1)}K`;
		}
		return num.toLocaleString();
	};

	const formatPercentage = (num: number) => {
		return `${num.toFixed(1)}%`;
	};

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				{/* Total Users */}
				<Card className="rounded">
					<CardContent className="p-6">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/20">
								<Users
									className="text-blue-600 dark:text-blue-400"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-muted-foreground text-sm">
									Total Users
								</p>
								<p className="font-bold text-2xl text-foreground">
									{formatNumber(summaryStats.totalUsers)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Completions */}
				<Card className="rounded">
					<CardContent className="p-6">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/20">
								<Target
									className="text-green-600 dark:text-green-400"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-muted-foreground text-sm">
									Completions
								</p>
								<p className="font-bold text-2xl text-foreground">
									{formatNumber(summaryStats.completions)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Conversion Rate */}
				<Card className="rounded">
					<CardContent className="p-6">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/20">
								<TrendUp
									className="text-purple-600 dark:text-purple-400"
									size={20}
									weight="duotone"
								/>
							</div>
							<div>
								<p className="font-medium text-muted-foreground text-sm">
									Conversion Rate
								</p>
								<p className="font-bold text-2xl text-foreground">
									{formatPercentage(summaryStats.conversionRate)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Goal Details */}
			<Card className="rounded">
				<CardHeader className="pb-3">
					<CardTitle className="text-lg">Goal Performance</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						<div className="rounded-lg bg-muted/30 p-4">
							<div className="mb-2 flex items-center justify-between">
								<span className="font-medium text-sm">Performance Summary</span>
								<span className="text-muted-foreground text-xs">
									{data.date_range?.start_date} - {data.date_range?.end_date}
								</span>
							</div>

							<div className="grid grid-cols-2 gap-4">
								<div>
									<p className="mb-1 text-muted-foreground text-xs">
										Users who reached goal
									</p>
									<p className="font-semibold text-lg">
										{formatNumber(summaryStats.completions)} /{' '}
										{formatNumber(summaryStats.totalUsers)}
									</p>
								</div>
								<div>
									<p className="mb-1 text-muted-foreground text-xs">
										Success rate
									</p>
									<p className="font-semibold text-green-600 text-lg">
										{formatPercentage(summaryStats.conversionRate)}
									</p>
								</div>
							</div>
						</div>

						{data.data.avg_completion_time > 0 && (
							<div className="rounded-lg bg-muted/30 p-4">
								<div className="flex items-center justify-between">
									<span className="font-medium text-sm">
										Average Time to Complete
									</span>
									<span className="font-semibold text-sm">
										{data.data.avg_completion_time_formatted ||
											`${Math.round(data.data.avg_completion_time)}s`}
									</span>
								</div>
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
