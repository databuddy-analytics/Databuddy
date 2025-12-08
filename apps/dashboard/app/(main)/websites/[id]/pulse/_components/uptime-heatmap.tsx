"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import dayjs from "dayjs";
import { useMemo } from "react";

type UptimeHeatmapProps = {
	data: {
		date: string;
		uptime_percentage?: number; // 0-100
		total_checks: number;
		failed_checks: number;
	}[];
	days?: number;
	isLoading?: boolean;
};

export function UptimeHeatmap({
	data,
	days = 90,
	isLoading = false,
}: UptimeHeatmapProps) {
	const heatmapData = useMemo(() => {
		const result = [];
		const today = dayjs().endOf("day");
		
		// Generate last X days
		for (let i = days - 1; i >= 0; i--) {
			const date = today.subtract(i, "day");
			const dateStr = date.format("YYYY-MM-DD");
			
			// Find data for this day
			const dayData = data.find(d => dayjs(d.date).format("YYYY-MM-DD") === dateStr);
			
			
			result.push({
				date: date.toDate(),
				dateStr,
				hasData: !!dayData,
				uptime: dayData?.uptime_percentage ?? 0,
				totalChecks: dayData?.total_checks ?? 0,
				failedChecks: dayData?.failed_checks ?? 0,
			});
		}
		return result;
	}, [data, days]);

	// Calculate overall stats for the period
	const periodStats = useMemo(() => {
		const daysWithData = heatmapData.filter(d => d.hasData);
		if (daysWithData.length === 0) return { uptime: 0 };
		
		const totalUptime = daysWithData.reduce((acc, curr) => acc + curr.uptime, 0);
		return {
			uptime: totalUptime / daysWithData.length
		};
	}, [heatmapData]);

	return (
		<>
			<div className="flex items-center justify-between border-b px-4 py-3">
				<h3 className="font-semibold text-lg text-sidebar-foreground tracking-tight">
					Uptime History
				</h3>
				<span className="text-muted-foreground text-sm">
					Last {days} days: {periodStats.uptime > 0 ? `${periodStats.uptime.toFixed(2)}%` : "No data"}
				</span>
			</div>
			
			<div className="p-4">
				<div className="flex h-16 w-full gap-[2px] sm:gap-1">
					{isLoading
						? [...Array(days)].map((_, i) => (
								<div
									key={i}
									className="h-full flex-1 animate-pulse rounded-sm bg-secondary"
								/>
							))
						: heatmapData.map((day) => {
								const getColorClass = () => {
									if (!day.hasData) return "bg-secondary";
									if (day.uptime >= 99.9)
										return "bg-emerald-500 hover:bg-emerald-600";
									if (day.uptime >= 98)
										return "bg-emerald-400 hover:bg-emerald-500";
									if (day.uptime >= 95)
										return "bg-emerald-300 hover:bg-emerald-400";
									if (day.uptime >= 90)
										return "bg-amber-400 hover:bg-amber-500";
									return "bg-red-500 hover:bg-red-600";
								};

								return (
									<Tooltip key={day.dateStr}>
										<TooltipTrigger asChild>
											<div
												className={cn(
													"h-full flex-1 rounded-sm transition-colors",
													getColorClass()
												)}
											/>
										</TooltipTrigger>
										<TooltipContent>
											<div className="text-xs">
												<p className="font-semibold">
													{dayjs(day.date).format("MMM D, YYYY")}
												</p>
												{day.hasData ? (
													<>
														<p>Uptime: {day.uptime.toFixed(2)}%</p>
														<p className="text-muted-foreground">
															{day.failedChecks} failures out of{" "}
															{day.totalChecks} checks
														</p>
													</>
												) : (
													<p className="text-muted-foreground">
														No data recorded
													</p>
												)}
											</div>	
										</TooltipContent>
									</Tooltip>
								);
							})}
				</div>
				
				<div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
					<span>{days} days ago</span>
					<span>Today</span>
				</div>
			</div>
		</>
	);
}
