"use client";

import type { UsageResponse } from "@databuddy/shared/types/billing";
import { BugIcon } from "@phosphor-icons/react/dist/ssr";
import { ChartBarIcon } from "@phosphor-icons/react/dist/ssr";
import { LightningIcon } from "@phosphor-icons/react/dist/ssr";
import { LinkIcon } from "@phosphor-icons/react/dist/ssr";
import { TagIcon } from "@phosphor-icons/react/dist/ssr";
import { TableIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ds/badge";
import { Card } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";
import { Skeleton } from "@/components/ds/skeleton";
import { Text } from "@/components/ds/text";
import { calculateOverageCost, type OverageInfo } from "../utils/billing-utils";

const EVENT_TYPE_CONFIG = {
	event: {
		name: "Page Views & Events",
		description: "Standard analytics events and page views",
		icon: ChartBarIcon,
	},
	error: {
		name: "Error Events",
		description: "JavaScript errors and exceptions",
		icon: BugIcon,
	},
	web_vitals: {
		name: "Web Vitals",
		description: "Core Web Vitals performance metrics",
		icon: LightningIcon,
	},
	custom_event: {
		name: "Custom Events",
		description: "Custom tracking events",
		icon: TagIcon,
	},
	outgoing_link: {
		name: "Outgoing Links",
		description: "External link click tracking",
		icon: LinkIcon,
	},
} as const;

interface UsageBreakdownTableProps {
	isLoading: boolean;
	overageInfo: OverageInfo | null;
	usageData?: UsageResponse;
}

export function UsageBreakdownTable({
	usageData,
	isLoading,
	overageInfo,
}: UsageBreakdownTableProps) {
	if (isLoading) {
		return (
			<Card>
				<Card.Header>
					<Skeleton className="h-3.5 w-36" />
					<Skeleton className="h-3 w-48" />
				</Card.Header>
				<Card.Content className="p-0">
					<div className="divide-y">
						{Array.from({ length: 5 }).map((_, i) => (
							<div className="flex items-center gap-3 px-5 py-3" key={i}>
								<Skeleton className="size-8 rounded" />
								<div className="min-w-0 flex-1 space-y-1">
									<Skeleton className="h-3.5 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
								<div className="space-y-1 text-right">
									<Skeleton className="h-3.5 w-16" />
									<Skeleton className="h-3 w-12" />
								</div>
							</div>
						))}
					</div>
				</Card.Content>
			</Card>
		);
	}

	if (!usageData?.eventTypeBreakdown?.length) {
		return (
			<Card>
				<Card.Header>
					<Card.Title>Usage by Event Type</Card.Title>
					<Card.Description>Breakdown of events by category</Card.Description>
				</Card.Header>
				<Card.Content className="py-8">
					<EmptyState
						icon={<TableIcon weight="duotone" />}
						title="No data available"
					/>
				</Card.Content>
			</Card>
		);
	}

	const { eventTypeBreakdown } = usageData;

	const sortedBreakdown = [...eventTypeBreakdown].sort(
		(a, b) => b.event_count - a.event_count
	);

	return (
		<Card>
			<Card.Header>
				<Card.Title>Usage by Event Type</Card.Title>
				<Card.Description>Breakdown of events by category</Card.Description>
			</Card.Header>
			<Card.Content className="p-0">
				<div className="divide-y">
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
								className="flex items-center gap-3 px-5 py-3"
								key={item.event_category}
							>
								<div className="flex size-8 shrink-0 items-center justify-center rounded border bg-secondary">
									<IconComponent
										className="size-3.5 text-accent-foreground"
										weight="duotone"
									/>
								</div>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<Text className="truncate" variant="label">
											{config.name}
										</Text>
										{overageCost > 0 && (
											<Badge variant="destructive">
												${overageCost.toFixed(2)}
											</Badge>
										)}
									</div>
									<Text tone="muted" variant="caption">
										{config.description} · {percentage.toFixed(1)}%
									</Text>
								</div>
								<div className="shrink-0 text-right">
									<Text className="tabular-nums" variant="label">
										{item.event_count.toLocaleString()}
									</Text>
									<Text tone="muted" variant="caption">
										events
									</Text>
								</div>
							</div>
						);
					})}
				</div>
			</Card.Content>
		</Card>
	);
}
