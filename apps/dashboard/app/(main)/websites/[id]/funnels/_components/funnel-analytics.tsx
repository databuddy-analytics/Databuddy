"use client";

import {
	ArrowClockwiseIcon,
	ClockIcon,
	TargetIcon,
	TrendDownIcon,
	UsersIcon,
	WarningCircleIcon,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { StatCard } from "@/components/analytics/stat-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import type { FunnelAnalyticsByReferrerResult } from "@/hooks/use-funnels";
import type {
	FunnelAnalyticsData,
	FunnelTimeSeriesPoint,
} from "@/types/funnels";
import { FunnelFlow } from "./funnel-flow";

function createChartData(
	timeSeries: FunnelTimeSeriesPoint[] | undefined,
	valueKey: keyof FunnelTimeSeriesPoint
): { date: string; value: number }[] {
	if (!timeSeries || timeSeries.length === 0) {
		return [];
	}
	return timeSeries.map((point) => ({
		date: point.date,
		value: point[valueKey] as number,
	}));
}

type FunnelAnalyticsProps = {
	isLoading: boolean;
	error: Error | null;
	data: FunnelAnalyticsData | undefined;
	onRetry: () => void;
	selectedReferrer?: string;
	referrerAnalytics?: FunnelAnalyticsByReferrerResult[];
};

function AnalyticsSkeleton() {
	return (
		<div className="space-y-6">
			{/* Stats grid skeleton */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard icon={UsersIcon} isLoading title="Users" value={0} />
				<StatCard icon={TargetIcon} isLoading title="Conversion" value={0} />
				<StatCard icon={TrendDownIcon} isLoading title="Drop-off" value={0} />
				<StatCard icon={ClockIcon} isLoading title="Avg Time" value={0} />
			</div>

			{/* Steps skeleton */}
			<div className="space-y-3">
				{[1, 2, 3].map((i) => (
					<div
						className="flex items-center gap-4 rounded border border-border bg-card p-4"
						key={i}
					>
						<Skeleton className="size-10 shrink-0 rounded-full" />
						<div className="min-w-0 flex-1 space-y-2">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-5 w-full rounded" />
						</div>
						<Skeleton className="h-6 w-14" />
					</div>
				))}
			</div>
		</div>
	);
}

export function FunnelAnalytics({
	isLoading,
	error,
	data,
	onRetry,
	selectedReferrer,
	referrerAnalytics,
}: FunnelAnalyticsProps) {
	const { chartType, chartStepType } = useChartPreferences("funnels");
	const selectedReferrerData = useMemo(() => {
		if (!selectedReferrer || selectedReferrer === "all" || !referrerAnalytics) {
			return null;
		}

		const referrer = referrerAnalytics.find(
			(r) =>
				r.referrer === selectedReferrer ||
				(selectedReferrer === "direct" &&
					(r.referrer === "direct" || r.referrer === ""))
		);

		return referrer ?? null;
	}, [selectedReferrer, referrerAnalytics]);

	const displayData = selectedReferrerData
		? {
				total_users_entered: selectedReferrerData.total_users,
				total_users_completed: selectedReferrerData.completed_users,
				overall_conversion_rate: selectedReferrerData.conversion_rate,
				avg_completion_time: 0,
				avg_completion_time_formatted: "0s",
				biggest_dropoff_step: 1,
				biggest_dropoff_rate: 100 - selectedReferrerData.conversion_rate,
				steps_analytics:
					data?.steps_analytics?.map((step, index) => ({
						...step,
						users:
							index === 0
								? selectedReferrerData.total_users
								: selectedReferrerData.completed_users,
						total_users: selectedReferrerData.total_users,
						conversion_rate:
							index === 0 ? 100 : selectedReferrerData.conversion_rate,
						dropoffs:
							index === 0
								? 0
								: selectedReferrerData.total_users -
									selectedReferrerData.completed_users,
						dropoff_rate:
							index === 0 ? 0 : 100 - selectedReferrerData.conversion_rate,
						avg_time_to_complete: 0,
					})) ?? [],
			}
		: data;

	if (isLoading) {
		return <AnalyticsSkeleton />;
	}

	if (error) {
		return (
			<div className="red-angled-rectangle-gradient rounded border border-destructive/30 bg-destructive/5 p-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="flex size-9 items-center justify-center rounded bg-destructive/10">
							<WarningCircleIcon
								className="size-5 text-destructive"
								weight="fill"
							/>
						</div>
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
						className="gap-1.5"
						onClick={onRetry}
						size="sm"
						variant="outline"
					>
						<ArrowClockwiseIcon className="size-3.5" weight="fill" />
						Retry
					</Button>
				</div>
			</div>
		);
	}

	if (!displayData) {
		return null;
	}

	// Prepare chart data from time series
	const timeSeries = data?.time_series;
	const usersChartData = createChartData(timeSeries, "users");
	const conversionChartData = createChartData(timeSeries, "conversion_rate");
	const dropoffChartData = createChartData(timeSeries, "dropoffs");
	const avgTimeChartData = createChartData(timeSeries, "avg_time");

	const hasChartData = usersChartData.length > 1;

	return (
		<div className="space-y-6">
			{/* Stats Grid */}
			<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
				<StatCard
					chartData={usersChartData}
					chartStepType={chartStepType}
					chartType={chartType}
					icon={UsersIcon}
					showChart={hasChartData}
					title="Users"
					value={displayData.total_users_entered}
				/>
				<StatCard
					chartData={conversionChartData}
					chartStepType={chartStepType}
					chartType={chartType}
					formatChartValue={(v) => `${v.toFixed(1)}%`}
					icon={TargetIcon}
					showChart={hasChartData}
					title="Conversion"
					value={`${displayData.overall_conversion_rate.toFixed(1)}%`}
				/>
				<StatCard
					chartData={dropoffChartData}
					chartStepType={chartStepType}
					chartType={chartType}
					icon={TrendDownIcon}
					invertTrend
					showChart={hasChartData}
					title="Drop-off"
					value={`${displayData.biggest_dropoff_rate.toFixed(1)}%`}
				/>
				<StatCard
					chartData={avgTimeChartData}
					chartStepType={chartStepType}
					chartType={chartType}
					formatChartValue={(v) =>
						v < 60 ? `${Math.round(v)}s` : `${Math.round(v / 60)}m`
					}
					icon={ClockIcon}
					showChart={hasChartData}
					title="Avg Time"
					value={displayData.avg_completion_time_formatted || "—"}
				/>
			</div>
			<FunnelFlow steps={displayData.steps_analytics} />
		</div>
	);
}
