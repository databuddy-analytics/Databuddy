'use client';

import type { UsageResponse } from '@databuddy/shared';
import {
	BugIcon,
	ChartBarIcon,
	LightningIcon,
	LinkIcon,
	SparkleIcon,
	TableIcon,
} from '@phosphor-icons/react';
import { Skeleton } from '@/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { calculateOverageCost, type OverageInfo } from '../utils/billing-utils';

const EVENT_TYPE_CONFIG = {
	event: {
		name: 'Page Views & Events',
		description: 'Standard analytics events and page views',
		icon: ChartBarIcon,
		color: 'blue',
	},
	error: {
		name: 'Error Events',
		description: 'JavaScript errors and exceptions',
		icon: BugIcon,
		color: 'red',
	},
	web_vitals: {
		name: 'Web Vitals',
		description: 'Core Web Vitals performance metrics',
		icon: LightningIcon,
		color: 'green',
	},
	custom_event: {
		name: 'Custom Events',
		description: 'Custom tracking events',
		icon: SparkleIcon,
		color: 'purple',
	},
	outgoing_link: {
		name: 'Outgoing Links',
		description: 'External link click tracking',
		icon: LinkIcon,
		color: 'orange',
	},
} as const;

interface UsageBreakdownTableProps {
	usageData?: UsageResponse;
	isLoading: boolean;
	overageInfo: OverageInfo | null;
}

export function UsageBreakdownTable({
	usageData,
	isLoading,
	overageInfo,
}: UsageBreakdownTableProps) {
	if (isLoading) {
		return (
			<div className="h-full p-6">
				<div className="space-y-4">
					{Array.from({ length: 5 }).map((_, i) => (
						<div className="flex items-center justify-between" key={i}>
							<div className="flex items-center gap-3">
								<Skeleton className="h-10 w-10 rounded" />
								<div className="space-y-1">
									<Skeleton className="h-4 w-32" />
									<Skeleton className="h-3 w-48" />
								</div>
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

	if (!usageData || usageData.eventTypeBreakdown.length === 0) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<TableIcon
						className="mx-auto mb-2 h-8 w-8 text-muted-foreground"
						weight="duotone"
					/>
					<p className="text-muted-foreground">No usage data available</p>
				</div>
			</div>
		);
	}

	const { eventTypeBreakdown } = usageData;

	const sortedBreakdown = [...eventTypeBreakdown].sort(
		(a, b) => b.event_count - a.event_count
	);

	return (
		<div className="h-full">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Event Type</TableHead>
						<TableHead>Usage</TableHead>
						<TableHead>Cost</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
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

						return (
							<TableRow key={item.event_category}>
								<TableCell>
									<div className="flex items-center gap-3">
										<div className="flex h-10 w-10 items-center justify-center rounded border bg-muted">
											<IconComponent
												className="h-5 w-5 text-muted-foreground"
												weight="duotone"
											/>
										</div>
										<div className="min-w-0 flex-1">
											<div className="font-medium">{config.name}</div>
											<div className="text-muted-foreground text-sm">
												{config.description}
											</div>
										</div>
									</div>
								</TableCell>
								<TableCell>
									<div className="font-medium">
										{item.event_count.toLocaleString()}
									</div>
									<div className="text-muted-foreground text-sm">events</div>
								</TableCell>
								<TableCell>
									<div className="font-medium">
										${overageCost.toPrecision(3)}
									</div>
								</TableCell>
							</TableRow>
						);
					})}
				</TableBody>
			</Table>

			{sortedBreakdown.length === 0 && (
				<div className="py-8 text-center">
					<TableIcon
						className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
						weight="duotone"
					/>
					<h3 className="font-semibold text-lg">No Event Data</h3>
					<p className="text-muted-foreground">
						No events found for the selected period
					</p>
				</div>
			)}
		</div>
	);
}
