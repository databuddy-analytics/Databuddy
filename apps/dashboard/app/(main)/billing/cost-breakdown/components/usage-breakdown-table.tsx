"use client";

import type { UsageResponse } from "@databuddy/shared/types/billing";
import {
	BugIcon,
	ChartBarIcon,
	LightningIcon,
	LinkIcon,
	SparkleIcon,
	TableIcon,
} from "@phosphor-icons/react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { calculateOverageCost, type OverageInfo } from "../utils/billing-utils";

const EVENT_TYPE_CONFIG = {
	event: {
		name: "Page Views & Events",
		description: "Standard analytics events and page views",
		icon: ChartBarIcon,
		color: "blue",
	},
	error: {
		name: "Error Events",
		description: "JavaScript errors and exceptions",
		icon: BugIcon,
		color: "red",
	},
	web_vitals: {
		name: "Web Vitals",
		description: "Core Web Vitals performance metrics",
		icon: LightningIcon,
		color: "green",
	},
	custom_event: {
		name: "Custom Events",
		description: "Custom tracking events",
		icon: SparkleIcon,
		color: "purple",
	},
	outgoing_link: {
		name: "Outgoing Links",
		description: "External link click tracking",
		icon: LinkIcon,
		color: "orange",
	},
} as const;

type UsageBreakdownTableProps = {
	usageData?: UsageResponse;
	isLoading: boolean;
	overageInfo: OverageInfo | null;
};

export function UsageBreakdownTable({
	usageData,
	isLoading,
	overageInfo,
}: UsageBreakdownTableProps) {
	if (isLoading) {
		return (
			<div className="h-full border-b px-4 py-3 sm:px-6 sm:py-4">
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<div className="flex items-center gap-4" key={i}>
							<Skeleton className="size-10 shrink-0 rounded border" />
							<div className="min-w-0 flex-1 space-y-1">
								<Skeleton className="h-4 w-32" />
								<Skeleton className="h-3 w-48" />
							</div>
							<div className="space-y-1 text-right">
								<Skeleton className="h-4 w-20" />
								<Skeleton className="h-3 w-16" />
							</div>
						</div>
					))}
				</div>
			</div>
		);
	}

	if (!usageData?.eventTypeBreakdown?.length) {
		return (
			<EmptyState
				icon={<TableIcon />}
				title="No Data Available"
				variant="minimal"
			/>
		);
	}

	const { eventTypeBreakdown } = usageData;

	const sortedBreakdown = [...eventTypeBreakdown].sort(
		(a, b) => b.event_count - a.event_count
	);

	return (
		<div className="h-full">
			<div className="border-b px-4 py-3 sm:px-6 sm:py-4">
				<h2 className="font-medium text-foreground text-lg">
					Usage by Event Type
				</h2>
			</div>
			<div className="divide-y divide-border">
				{sortedBreakdown.map((item) => {
					const config =
						EVENT_TYPE_CONFIG[
							item.event_category as keyof typeof EVENT_TYPE_CONFIG
						];

					if (!config) {
						return null;
					}

					const overageCost = usageData
						? calculateOverageCost(
								item.event_count,
								usageData.totalEvents,
								overageInfo
							)
						: 0;

					const IconComponent = config.icon;
					const percentage =
						usageData && usageData.totalEvents > 0
							? (item.event_count / usageData.totalEvents) * 100
							: 0;

					return (
						<div
							className="group flex items-center gap-4 px-4 py-3 hover:bg-accent/50 sm:px-6 sm:py-4"
							key={item.event_category}
						>
							<div className="flex size-10 shrink-0 items-center justify-center rounded border border-accent-foreground/10 bg-secondary">
								<IconComponent
									className="size-5 text-accent-foreground"
									weight="duotone"
								/>
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<div className="font-medium text-foreground">
										{config.name}
									</div>
									{overageCost > 0 && (
										<Badge className="h-5 px-2" variant="destructive">
											${overageCost.toFixed(2)}
										</Badge>
									)}
								</div>
								<div className="mt-0.5 flex items-center gap-2">
									<span className="text-muted-foreground text-sm">
										{config.description}
									</span>
									<span className="text-muted-foreground text-xs">
										· {percentage.toFixed(1)}%
									</span>
								</div>
							</div>
							<div className="shrink-0 text-right">
								<div className="font-semibold text-foreground tabular-nums">
									{item.event_count.toLocaleString()}
								</div>
								<div className="text-muted-foreground text-xs">events</div>
							</div>
						</div>
					);
				})}
			</div>

			{sortedBreakdown.length === 0 && (
				<div className="py-12 text-center">
					<TableIcon
						className="mx-auto mb-4 size-12 text-muted-foreground"
						weight="duotone"
					/>
					<h3 className="font-semibold text-foreground text-lg">
						No Event Data
					</h3>
					<p className="mt-1 text-muted-foreground text-sm">
						No events found for the selected period
					</p>
				</div>
			)}
		</div>
	);
}
