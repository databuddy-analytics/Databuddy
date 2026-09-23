"use client";

import { useMemo } from "react";
import {
	buildUptimeHeatmapDays,
	UptimeHeatmapStrip,
} from "@databuddy/ui/uptime";

export type MonitorDailyData = Array<{
	avg_response_time?: number;
	date: string;
	downtime_seconds?: number;
	p95_response_time?: number;
	successful_checks?: number;
	total_checks?: number;
	uptime_percentage?: number;
}>;

interface UptimeHistoryProps {
	dailyData: MonitorDailyData;
	days: number;
	uptimePercentage: number;
}

function formatUptime(pct: number): string {
	return pct >= 100 ? "100" : (Math.floor(pct * 100) / 100).toFixed(2);
}

export function UptimeHistory({
	dailyData,
	days,
	uptimePercentage,
}: UptimeHistoryProps) {
	const heatmapData = useMemo(
		() => buildUptimeHeatmapDays(dailyData, days),
		[dailyData, days]
	);

	return (
		<div>
			<UptimeHeatmapStrip
				days={heatmapData}
				emptyLabel="No data recorded"
				interactive
				isActive
				variant="bars"
			/>
			<div className="mt-2 flex items-center gap-3 text-muted-foreground text-xs">
				<span className="shrink-0">{days} days ago</span>
				<span aria-hidden className="h-px flex-1 bg-border/70" />
				<span className="shrink-0 tabular-nums">
					{formatUptime(uptimePercentage)}% uptime
				</span>
				<span aria-hidden className="h-px flex-1 bg-border/70" />
				<span className="shrink-0">Today</span>
			</div>
		</div>
	);
}
