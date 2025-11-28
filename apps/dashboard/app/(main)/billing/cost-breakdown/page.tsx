"use client";

import { useQuery } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { useOrganizationsContext } from "@/components/providers/organizations-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/lib/orpc";
import { ConsumptionChart } from "./components/consumption-chart";
import { UsageBreakdownTable } from "./components/usage-breakdown-table";
import type { OverageInfo } from "./utils/billing-utils";

function getDefaultDateRange() {
	const end = new Date();
	const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
	return {
		startDate: start.toISOString().split("T")[0],
		endDate: end.toISOString().split("T")[0],
	};
}

function calculateOverageInfo(
	balance: number,
	includedUsage: number,
	unlimited: boolean
): OverageInfo {
	// Balance < 0 = overage
	// Balance >= 0 = remaining events
	if (unlimited || balance >= 0) {
		return {
			hasOverage: false,
			overageEvents: 0,
			includedEvents: includedUsage,
		};
	}
	return {
		hasOverage: true,
		overageEvents: Math.abs(balance),
		includedEvents: includedUsage,
	};
}

export default function CostBreakdownPage() {
	const [dateRange, setDateRange] = useState(getDefaultDateRange);
	const { activeOrganization, isLoading: isOrgLoading } =
		useOrganizationsContext();

	const { data: usageData, isLoading: isUsageLoading } = useQuery({
		...orpc.billing.getUsage.queryOptions({
			input: {
				startDate: dateRange.startDate,
				endDate: dateRange.endDate,
				organizationId: activeOrganization?.id || null,
			},
		}),
		enabled: !isOrgLoading,
	});

	const { data: orgUsage } = useQuery({
		...orpc.organizations.getUsage.queryOptions(),
	});

	const overageInfo = useMemo(() => {
		if (!orgUsage) {
			return null;
		}
		return calculateOverageInfo(
			orgUsage.balance ?? 0,
			orgUsage.includedUsage ?? 0,
			orgUsage.unlimited
		);
	}, [orgUsage]);

	return (
		<main className="min-h-0 flex-1 overflow-y-auto">
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex-3">
					<Suspense fallback={<Skeleton className="h-full w-full" />}>
						<ConsumptionChart
							isLoading={isUsageLoading}
							onDateRangeChange={(start, end) =>
								setDateRange({ startDate: start, endDate: end })
							}
							overageInfo={overageInfo}
							usageData={usageData}
						/>
					</Suspense>
				</div>
				<div className="flex-2">
					<Suspense fallback={<Skeleton className="h-full w-full" />}>
						<UsageBreakdownTable
							isLoading={isUsageLoading}
							overageInfo={overageInfo}
							usageData={usageData}
						/>
					</Suspense>
				</div>
			</div>
		</main>
	);
}
