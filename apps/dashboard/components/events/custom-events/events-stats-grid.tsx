"use client";

import type { ElementType } from "react";
import type {
	ChartCurveType,
	ChartSeriesKind,
} from "@/components/ui/composables/chart";
import { StatCard } from "@/components/analytics";
import { formatNumber } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
	CalendarBlankIcon,
	LightningIcon,
	TagIcon,
	TrendUpIcon,
	UserIcon,
	UsersIcon,
} from "@databuddy/ui/icons";
import type {
	CustomEventsMetricKey,
	CustomEventsSummary,
	MiniChartDataPoint,
} from "./types";

type MiniChartSeries = Record<
	Exclude<CustomEventsMetricKey, "events_today">,
	MiniChartDataPoint[]
>;

interface EventsStatsGridProps {
	chartStepType: ChartCurveType;
	chartType: ChartSeriesKind;
	className?: string;
	isLoading?: boolean;
	metricKeys: CustomEventsMetricKey[];
	miniChartData: MiniChartSeries;
	summary: CustomEventsSummary;
	todayEvents: number;
	todayUsers: number;
}

export const ORGANIZATION_EVENTS_METRICS: CustomEventsMetricKey[] = [
	"total_events",
	"unique_event_types",
	"unique_users",
	"events_today",
];

export const WEBSITE_EVENTS_METRICS: CustomEventsMetricKey[] = [
	"total_events",
	"unique_users",
	"unique_event_types",
	"unique_sessions",
	"unique_pages",
];

export function EventsStatsGrid({
	chartStepType,
	chartType,
	className,
	isLoading,
	metricKeys,
	miniChartData,
	summary,
	todayEvents,
	todayUsers,
}: EventsStatsGridProps) {
	return (
		<div
			className={cn(
				"grid grid-cols-1 gap-1.5 rounded-xl bg-secondary p-1.5 sm:grid-cols-2",
				metricKeys.length >= 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
				className
			)}
		>
			{metricKeys.map((metric) => {
				if (metric === "events_today") {
					return (
						<StatCard
							chartData={isLoading ? undefined : miniChartData.total_events}
							chartStepType={chartStepType}
							chartType={chartType}
							description={`${summary.unique_users > 0 ? (summary.total_events / summary.unique_users).toFixed(1) : "0"} per user`}
							icon={TrendUpIcon}
							id="events-today"
							isLoading={isLoading}
							key={metric}
							showChart
							title="Events Today"
							value={formatNumber(todayEvents)}
						/>
					);
				}

				const config: {
					chartData: MiniChartDataPoint[];
					description?: string;
					icon: ElementType;
					id: string;
					title: string;
					value: number;
				} = {
					total_events: {
						chartData: miniChartData.total_events,
						description: `${formatNumber(todayEvents)} today`,
						icon: LightningIcon,
						id: "events-total",
						title: "Total Events",
						value: summary.total_events,
					},
					unique_users: {
						chartData: miniChartData.unique_users,
						description: `${formatNumber(todayUsers)} today`,
						icon: UserIcon,
						id: "events-users",
						title: "Unique Users",
						value: summary.unique_users,
					},
					unique_event_types: {
						chartData: miniChartData.unique_event_types,
						icon: TagIcon,
						id: "events-types",
						title: "Event Types",
						value: summary.unique_event_types,
					},
					unique_sessions: {
						chartData: miniChartData.unique_sessions,
						icon: UsersIcon,
						id: "events-sessions",
						title: "Sessions",
						value: summary.unique_sessions,
					},
					unique_pages: {
						chartData: miniChartData.unique_pages,
						icon: CalendarBlankIcon,
						id: "events-pages",
						title: "Unique Pages",
						value: summary.unique_pages,
					},
				}[metric];

				return (
					<StatCard
						chartData={isLoading ? undefined : config.chartData}
						chartStepType={chartStepType}
						chartType={chartType}
						description={config.description}
						icon={config.icon}
						id={config.id}
						isLoading={isLoading}
						key={metric}
						showChart
						title={config.title}
						value={formatNumber(config.value)}
					/>
				);
			})}
		</div>
	);
}
