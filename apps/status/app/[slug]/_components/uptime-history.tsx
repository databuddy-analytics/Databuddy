"use client";

import { useMemo } from "react";
import {
	buildUptimeHeatmapDays,
	UptimeHeatmapStrip,
} from "@databuddy/ui/uptime";

interface UptimeHistoryProps {
	dailyData: Array<{
		date: string;
		downtime_seconds?: number;
		successful_checks?: number;
		total_checks?: number;
		uptime_percentage?: number;
	}>;
	days: number;
}

export function UptimeHistory({ dailyData, days }: UptimeHistoryProps) {
	const heatmapData = useMemo(
		() => buildUptimeHeatmapDays(dailyData, days),
		[dailyData, days]
	);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between px-0.5 text-muted-foreground text-sm leading-[1.2] sm:text-base">
				<span className="font-medium">{days} days ago</span>
				<span>Today</span>
			</div>
			<UptimeHeatmapStrip
				days={heatmapData}
				emptyLabel="No data recorded"
				interactive
				isActive
			/>
		</div>
	);
}
