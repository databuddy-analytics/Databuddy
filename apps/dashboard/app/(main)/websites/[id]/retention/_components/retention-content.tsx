"use client";

import {
	ChartLineIcon,
	RepeatIcon,
	TableIcon,
	UsersIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

	const cohortsData = data;
	const rateData = data;
	const cohortsLoading = isLoading;
	const rateLoading = isLoading;

	const cohorts = useMemo(
		() => (cohortsData?.retention_cohorts as RetentionCohort[]) ?? [],
		[cohortsData]
	);

	const rates = useMemo(() => {
		const rawRates = (rateData?.retention_rate as RetentionRate[]) ?? [];
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
	}, [rateData, dateRange]);

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
			avgRetentionRate: overallRetentionRate.toFixed(1),
			totalUsers: totalUniqueUsers,
			totalNewUsers,
			totalReturningUsers,
			avgWeek1Retention: avgWeek1Retention.toFixed(1),
		};
	}, [rates, cohorts]);

	return (
		<div className="space-y-6">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
				{isLoading ? (
					[...new Array(4)].map((_, i) => (
						<Card key={i}>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<Skeleton className="h-10 w-10 rounded-lg" />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-3 w-24 rounded" />
										<Skeleton className="h-6 w-16 rounded" />
									</div>
								</div>
							</CardContent>
						</Card>
					))
				) : (
					<>
						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
										<RepeatIcon
											className="h-5 w-5 text-primary"
											weight="duotone"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Overall Retention Rate
										</p>
										<p className="font-bold text-foreground text-xl">
											{overallStats.avgRetentionRate}%
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
										<UsersIcon
											className="h-5 w-5 text-primary"
											weight="duotone"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Total Users
										</p>
										<p className="font-bold text-foreground text-xl">
											{overallStats.totalUsers.toLocaleString()}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
										<ChartLineIcon
											className="h-5 w-5 text-primary"
											weight="duotone"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Week 1 Retention
										</p>
										<p className="font-bold text-foreground text-xl">
											{overallStats.avgWeek1Retention}%
										</p>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardContent className="p-4">
								<div className="flex items-center gap-3">
									<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
										<UsersIcon
											className="h-5 w-5 text-primary"
											weight="duotone"
										/>
									</div>
									<div>
										<p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
											Returning Users
										</p>
										<p className="font-bold text-foreground text-xl">
											{overallStats.totalReturningUsers.toLocaleString()}
										</p>
									</div>
								</div>
							</CardContent>
						</Card>
					</>
				)}
			</div>
			<Tabs
				className="space-y-6"
				defaultValue="cohorts"
				onValueChange={setActiveTab}
				value={activeTab}
			>
				<div className="border-border border-b">
					<TabsList className="h-11 w-full justify-start overflow-x-auto bg-transparent p-0">
						<TabsTrigger
							className="relative h-11 whitespace-nowrap rounded-none border-transparent border-b-2 px-4 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
							value="cohorts"
						>
							<TableIcon className="mr-2 h-4 w-4" weight="duotone" />
							Retention Cohorts
						</TabsTrigger>
						<TabsTrigger
							className="relative h-11 whitespace-nowrap rounded-none border-transparent border-b-2 px-4 font-medium text-muted-foreground text-sm transition-colors hover:bg-muted/50 hover:text-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none"
							value="rate"
						>
							<ChartLineIcon className="mr-2 h-4 w-4" weight="duotone" />
							Retention Rate
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent className="space-y-6" value="cohorts">
					<div className="space-y-4">
						<div>
							<h3 className="font-semibold text-foreground text-lg">
								Retention by Cohort
							</h3>
							<p className="text-muted-foreground text-sm">
								Track what percentage of users from each cohort return over 5
								weeks
							</p>
						</div>
						<RetentionCohortsGrid
							cohorts={cohorts}
							isLoading={cohortsLoading}
						/>
					</div>
				</TabsContent>

				<TabsContent className="space-y-6" value="rate">
					<Card>
						<CardHeader>
							<CardTitle>Daily Retention Rate</CardTitle>
							<p className="text-muted-foreground text-sm">
								View the percentage of returning users vs new users over time
							</p>
						</CardHeader>
						<CardContent>
							<RetentionRateChart data={rates} isLoading={rateLoading} />
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	);
}
