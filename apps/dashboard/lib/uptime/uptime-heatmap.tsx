"use client";

import { useMemo } from "react";
import dayjs from "@/lib/dayjs";
import { buildUptimeHeatmapDays } from "./heatmap-days";
import { UptimeHeatmapStrip } from "./heatmap-strip";

interface UptimeHeatmapProps {
	data: {
		date: string;
		uptime_percentage?: number;
		downtime_seconds?: number;
	}[];
	days?: number;
	isLoading?: boolean;
}

export function UptimeHeatmap({
	data,
	days = 90,
	isLoading = false,
}: UptimeHeatmapProps) {
	const heatmapData = useMemo(
		() => buildUptimeHeatmapDays(data, days),
		[data, days]
	);

	const periodStats = useMemo(() => {
		const daysWithData = heatmapData.filter((d) => d.hasData);
		if (daysWithData.length === 0) {
			return { uptime: 0 };
		}

		const secondsPerDay = 86_400;
		const totalCalendarSeconds = daysWithData.length * secondsPerDay;
		const totalDowntimeSeconds = daysWithData.reduce(
			(acc, curr) => acc + curr.downtimeSeconds,
			0
		);

		return {
			uptime:
				totalCalendarSeconds > 0
					? Math.min(
							100,
							(1 -
								Math.min(totalDowntimeSeconds, totalCalendarSeconds) /
									totalCalendarSeconds) *
								100
						)
					: 0,
		};
	}, [heatmapData]);

	return (
		<>
			<div className="flex h-10 items-center justify-between gap-3 border-b px-4 py-2.5 sm:px-6">
				<h3 className="text-balance font-semibold text-lg text-sidebar-foreground">
					Uptime History
				</h3>
				<span className="shrink-0 text-muted-foreground text-sm tabular-nums">
					Last {days} days:{" "}
					{periodStats.uptime > 0
						? `${periodStats.uptime.toFixed(2)}%`
						: "No data"}
				</span>
			</div>

			<div className="p-4">
				{isLoading ? (
					<div className="flex h-16 w-full gap-[2px] sm:gap-1">
						{Array.from({ length: days }).map((_, i) => (
							<div
								className="h-full flex-1 animate-pulse rounded-sm bg-secondary"
								key={i}
							/>
						))}
					</div>
				) : (
					<UptimeHeatmapStrip
						days={heatmapData}
						emptyLabel="No data recorded"
						getDateLabel={(d) => dayjs(d).format("MMM D, YYYY")}
						interactive
						isActive
						stripClassName="flex h-16 w-full gap-[2px] sm:gap-1"
					/>
				)}
			</div>
		</>
	);
}
