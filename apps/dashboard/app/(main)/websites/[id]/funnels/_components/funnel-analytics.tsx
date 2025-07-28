'use client';

import {
	ArrowClockwiseIcon,
	ChartBarIcon,
	TargetIcon,
	TrendDownIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import type { FunnelAnalyticsData } from '@/types/funnels';
import { FunnelFlow } from './funnel-flow';

interface ReferrerAnalytics {
	referrer: string;
	referrer_parsed: {
		domain: string;
		url: string;
	};
	total_users: number;
	completed_users: number;
	conversion_rate: number;
}

interface FunnelAnalyticsProps {
	isLoading: boolean;
	error: Error | null;
	data: FunnelAnalyticsData | undefined;
	onRetry: () => void;
	selectedReferrer?: string;
	referrerAnalytics?: ReferrerAnalytics[];
}

export function FunnelAnalytics({
	isLoading,
	error,
	data,
	onRetry,
	selectedReferrer,
	referrerAnalytics,
}: FunnelAnalyticsProps) {
	// Derive selected referrer's metrics from referrer_analytics data
	const selectedReferrerData = useMemo(() => {
		if (!selectedReferrer || selectedReferrer === 'all' || !referrerAnalytics) {
			return null;
		}

		const referrer = referrerAnalytics.find(
			(r) =>
				r.referrer === selectedReferrer ||
				(selectedReferrer === 'direct' &&
					(r.referrer === 'direct' || r.referrer === ''))
		);

		return referrer || null;
	}, [selectedReferrer, referrerAnalytics]);

	// Use selected referrer data if available, otherwise use main analytics data
	const displayData = selectedReferrerData
		? {
				total_users_entered: selectedReferrerData.total_users,
				total_users_completed: selectedReferrerData.completed_users,
				overall_conversion_rate: selectedReferrerData.conversion_rate,
				avg_completion_time: 0, // Not available in referrer analytics
				avg_completion_time_formatted: '0s',
				biggest_dropoff_step: 1,
				biggest_dropoff_rate: 100 - selectedReferrerData.conversion_rate,
				steps_analytics: [
					{
						step_number: 1,
						step_name: 'Landing Page',
						users: selectedReferrerData.total_users,
						total_users: selectedReferrerData.total_users,
						conversion_rate: 100,
						dropoffs: 0,
						dropoff_rate: 0,
						avg_time_to_complete: 0,
					},
					{
						step_number: 2,
						step_name: 'Completed',
						users: selectedReferrerData.completed_users,
						total_users: selectedReferrerData.total_users,
						conversion_rate: selectedReferrerData.conversion_rate,
						dropoffs:
							selectedReferrerData.total_users -
							selectedReferrerData.completed_users,
						dropoff_rate: 100 - selectedReferrerData.conversion_rate,
						avg_time_to_complete: 0,
					},
				],
			}
		: data;

	if (isLoading) {
		return (
			<div className="fade-in-50 animate-in space-y-4 duration-500">
				{/* Loading Summary Stats */}
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<div className="h-4 w-4 animate-pulse rounded bg-muted" />
						<div className="h-4 w-24 animate-pulse rounded bg-muted" />
					</div>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{[...new Array(3)].map((_, i) => (
							<div
								className="animate-pulse rounded border bg-card p-3"
								key={`summary-stat-skeleton-${i + 1}`}
							>
								<div className="mb-1 flex items-center gap-2">
									<div className="h-3 w-3 rounded bg-muted" />
									<div className="h-3 w-12 rounded bg-muted" />
								</div>
								<div className="h-4 w-16 rounded bg-muted" />
							</div>
						))}
					</div>
				</div>

				{/* Loading Funnel Flow */}
				<div className="space-y-2">
					<div className="flex items-center gap-2">
						<div className="h-4 w-4 animate-pulse rounded bg-muted" />
						<div className="h-4 w-20 animate-pulse rounded bg-muted" />
					</div>
					<div className="space-y-2">
						{[...new Array(3)].map((_, i) => (
							<div
								className="animate-pulse space-y-1"
								key={`funnel-step-skeleton-${i + 1}`}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<div className="h-5 w-5 rounded-full bg-muted" />
										<div className="h-3 w-24 rounded bg-muted" />
									</div>
									<div className="h-4 w-12 rounded bg-muted" />
								</div>
								<div className="h-6 rounded bg-muted" />
							</div>
						))}
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="py-4">
				<div className="flex items-center justify-between rounded border bg-destructive/5 p-3">
					<div className="flex items-center gap-2">
						<TrendDownIcon
							className="h-4 w-4 text-destructive"
							size={14}
							weight="duotone"
						/>
						<div>
							<div className="font-medium text-destructive text-sm">
								Error loading analytics
							</div>
							<div className="text-muted-foreground text-xs">
								{error.message}
							</div>
						</div>
					</div>
					<Button
						className="h-7 gap-1 rounded"
						onClick={onRetry}
						size="sm"
						variant="outline"
					>
						<ArrowClockwiseIcon className="h-3 w-3" size={12} weight="fill" />
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!displayData) {
		return null;
	}

	return (
		<div className="space-y-4">
			{/* Summary Stats */}
			<div className="space-y-2">
				<div className="flex items-center gap-2">
					<ChartBarIcon
						className="h-4 w-4 text-primary"
						size={14}
						weight="duotone"
					/>
					<h3 className="font-semibold text-foreground text-sm">
						{selectedReferrerData
							? `Performance - ${selectedReferrerData.referrer_parsed?.domain || selectedReferrerData.referrer}`
							: 'Performance'}
					</h3>
				</div>
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
					<div className="rounded border bg-card p-3">
						<div className="mb-1 flex items-center gap-2">
							<UsersIcon className="text-muted-foreground" size={12} />
							<span className="text-muted-foreground text-xs">Users</span>
						</div>
						<div className="font-semibold text-sm">
							{displayData.total_users_entered.toLocaleString()}
						</div>
					</div>
					<div className="rounded border bg-card p-3">
						<div className="mb-1 flex items-center gap-2">
							<TargetIcon className="text-muted-foreground" size={12} />
							<span className="text-muted-foreground text-xs">Conversion</span>
						</div>
						<div className="font-semibold text-primary text-sm">
							{displayData.overall_conversion_rate.toFixed(1)}%
						</div>
					</div>
					<div className="rounded border bg-card p-3">
						<div className="mb-1 flex items-center gap-2">
							<TrendDownIcon className="text-muted-foreground" size={12} />
							<span className="text-muted-foreground text-xs">Drop-off</span>
						</div>
						<div className="font-semibold text-destructive text-sm">
							{displayData.biggest_dropoff_rate.toFixed(1)}%
						</div>
					</div>
				</div>
			</div>

			{/* Funnel Flow */}
			<FunnelFlow
				steps={displayData.steps_analytics}
				totalUsers={displayData.total_users_entered}
			/>
		</div>
	);
}
