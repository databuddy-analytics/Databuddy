"use client";

import { LatencyChart } from "@databuddy/ui/uptime";
import { UptimeHistory } from "./uptime-history";

export type MonitorDailyData = Array<{
	avg_response_time?: number;
	date: string;
	downtime_seconds?: number;
	p95_response_time?: number;
	successful_checks?: number;
	total_checks?: number;
	uptime_percentage?: number;
}>;

interface MonitorRowInteractiveProps {
	dailyData: MonitorDailyData;
	days: number;
	hasLatencyData: boolean;
	hasUptimeData?: boolean;
	id: string;
}

export function MonitorRowInteractive({
	dailyData,
	days,
	hasLatencyData,
	hasUptimeData = true,
	id,
}: MonitorRowInteractiveProps) {
	return (
		<>
			{hasUptimeData ? (
				<UptimeHistory dailyData={dailyData} days={days} />
			) : null}

			{hasLatencyData ? (
				<div className="mt-4 border-border/60 border-t pt-2">
					<LatencyChart data={dailyData} storageKey={`status-latency-${id}`} />
				</div>
			) : null}
		</>
	);
}
