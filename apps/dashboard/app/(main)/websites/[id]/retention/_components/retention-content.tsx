"use client";

import {
	ArrowCounterClockwiseIcon,
	ChartLineIcon,
	TableIcon,
	UserPlusIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { StatCard } from "@/components/analytics";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDateFilters } from "@/hooks/use-date-filters";
import { useDynamicQuery } from "@/hooks/use-dynamic-query";
import { RetentionCohortsGrid } from "./retention-cohorts-grid";
import { RetentionRateChart } from "./retention-rate-chart";

type RetentionContentProps = {
	websiteId: string;
};

type RetentionCohort = {
	cohort: string;
	users: number;
	week_0_retention: number;
	week_1_retention: number;
	week_2_retention: number;
	week_3_retention: number;
	week_4_retention: number;
	week_5_retention: number;
};

type RetentionRate = {
	date: string;
	new_users: number;
	returning_users: number;
	retention_rate: number;
};

export function RetentionContent({ websiteId }: RetentionContentProps) {
	const { dateRange } = useDateFilters();
	const [activeTab, setActiveTab] = useState("cohorts");

	const { data, isLoading } = useDynamicQuery(
		websiteId,
		dateRange,
		{
			id: "retention-metrics",
			parameters: ["retention_cohorts", "retention_rate"],
		},
		{
			staleTime: 5 * 60 * 1000,
			gcTime: 10 * 60 * 1000,
		}
	);

	const cohorts = useMemo(
		() => (data?.retention_cohorts as RetentionCohort[]) ?? [],
		[data]
	);

	const rates = useMemo(() => {
		const rawRates = (data?.retention_rate as RetentionRate[]) ?? [];
		const hasDateRange = dateRange?.start_date && dateRange?.end_date;
		if (!hasDateRange) {
			return rawRates;
		}

		const start = dayjs(dateRange.start_date).startOf("day");
		const end = dayjs(dateRange.end_date).startOf("day");

		return rawRates.filter((rate) => {
			const date = dayjs(rate.date).startOf("day");
			return date.isValid() && !date.isBefore(start) && !date.isAfter(end);
		});
	}, [data, dateRange]);

	const overallStats = useMemo(() => {
		const totalNewUsers = rates.reduce((sum, rate) => sum + rate.new_users, 0);
		const totalReturningUsers = rates.reduce(
			(sum, rate) => sum + rate.returning_users,
			0
		);
		const totalUniqueUsers = totalNewUsers + totalReturningUsers;

		const overallRetentionRate =
			totalUniqueUsers > 0 ? (totalReturningUsers / totalUniqueUsers) * 100 : 0;

		const weightedWeek1 = cohorts.reduce(
			(sum, cohort) => sum + cohort.week_1_retention * cohort.users,
			0
		);
		const totalCohortUsers = cohorts.reduce(
			(sum, cohort) => sum + cohort.users,
			0
		);
		const avgWeek1Retention =
			totalCohortUsers > 0 ? weightedWeek1 / totalCohortUsers : 0;

		return {
			avgRetentionRate: overallRetentionRate,
			totalUsers: totalUniqueUsers,
			totalNewUsers,
			totalReturningUsers,
			avgWeek1Retention,
		};
	}, [rates, cohorts]);

	// Build mini chart data from time-series retention data
	const chartData = useMemo(() => ({
		retentionRate: rates.map((rate) => ({
			date: rate.date,
			value: rate.retention_rate,
		})),
		totalUsers: rates.map((rate) => ({
			date: rate.date,
			value: rate.new_users + rate.returning_users,
		})),
		newUsers: rates.map((rate) => ({
			date: rate.date,
			value: rate.new_users,
		})),
		returningUsers: rates.map((rate) => ({
			date: rate.date,
			value: rate.returning_users,
		})),
	}), [rates]);

	const formatNumber = (num: number) => {
		if (num >= 1_000_000) {
			return `${(num / 1_000_000).toFixed(1)}M`;
		}
		if (num >= 1000) {
			return `${(num / 1000).toFixed(1)}K`;
		}
		return num.toLocaleString();
	};

	return (
		<div className="flex h-full min-h-0 flex-col gap-4">
			{/* Stats Grid */}
			<div className="grid shrink-0 grid-cols-2 gap-4 lg:grid-cols-4">
				<StatCard
					chartData={chartData.retentionRate}
					formatChartValue={(v) => `${v.toFixed(1)}%`}
					icon={ArrowCounterClockwiseIcon}
					id="retention-rate"
					isLoading={isLoading}
					showChart
					title="Retention Rate"
					value={`${overallStats.avgRetentionRate.toFixed(1)}%`}
				/>
				<StatCard
					chartData={chartData.totalUsers}
					icon={UsersIcon}
					id="total-users"
					isLoading={isLoading}
					showChart
					title="Total Users"
					value={formatNumber(overallStats.totalUsers)}
				/>
				<StatCard
					chartData={chartData.newUsers}
					icon={UserPlusIcon}
					id="new-users"
					isLoading={isLoading}
					showChart
					title="New Users"
					value={formatNumber(overallStats.totalNewUsers)}
				/>
				<StatCard
					chartData={chartData.returningUsers}
					icon={ChartLineIcon}
					id="returning-users"
					isLoading={isLoading}
					showChart
					title="Returning Users"
					value={formatNumber(overallStats.totalReturningUsers)}
				/>
			</div>

			{/* Tabs Section */}
			<Tabs
				className="flex min-h-0 flex-1 flex-col"
				onValueChange={setActiveTab}
				value={activeTab}
			>
				<div className="shrink-0 rounded border bg-sidebar">
					<div className="flex items-center justify-between border-b px-4 py-3">
						<div>
							<h2 className="font-semibold text-sidebar-foreground">
								Retention Analysis
							</h2>
							<p className="text-muted-foreground text-sm">
								Track user retention over time
							</p>
						</div>
						<TabsList className="h-9 bg-sidebar-accent">
							<TabsTrigger className="gap-1.5 px-3 text-xs" value="cohorts">
								<TableIcon className="size-4" weight="duotone" />
								Cohorts
							</TabsTrigger>
							<TabsTrigger className="gap-1.5 px-3 text-xs" value="rate">
								<ChartLineIcon className="size-4" weight="duotone" />
								Daily Rate
							</TabsTrigger>
						</TabsList>
					</div>

					<TabsContent
						className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
						value="cohorts"
					>
						<div className="p-4">
							<RetentionCohortsGrid
								cohorts={cohorts}
								isLoading={isLoading}
							/>
						</div>
					</TabsContent>

					<TabsContent
						className="mt-0 min-h-0 flex-1 data-[state=inactive]:hidden"
						value="rate"
					>
						<div className="h-[400px] p-4">
							<RetentionRateChart data={rates} isLoading={isLoading} />
						</div>
					</TabsContent>
				</div>
			</Tabs>
		</div>
	);
}
