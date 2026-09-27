"use client";

import { useId, useState } from "react";
import { cn, StatusDot } from "@databuddy/ui";
import { CaretDownIcon } from "@databuddy/ui/icons";
import {
	buildUptimeHeatmapDays,
	LatencyChart,
	UptimeHeatmapStrip,
} from "@databuddy/ui/uptime";
import type { StatusMonitor } from "./status-page";

const LAST_CHECK_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
	timeZone: "UTC",
	timeZoneName: "short",
});

function formatUptime(pct: number): string {
	return pct >= 100 ? "100" : (Math.floor(pct * 100) / 100).toFixed(2);
}

export function MonitorCardInteractive({
	anchorId,
	days,
	monitor: {
		currentStatus,
		dailyData,
		domain,
		freshness,
		id,
		lastCheckedAt,
		name,
		uptimePercentage,
	},
}: {
	anchorId: string;
	days: number;
	monitor: StatusMonitor;
}) {
	const [isOpen, setIsOpen] = useState(true);
	const panelId = useId();
	const hasLatencyData = dailyData.some(
		(d) => d.avg_response_time != null || d.p95_response_time != null
	);
	const statusConfig = {
		up: { label: "Operational", color: "success" as const },
		degraded: { label: "Degraded", color: "warning" as const },
		down: { label: "Down", color: "destructive" as const },
		unknown: {
			label: freshness === "stale" ? "Data stale" : "Status unknown",
			color: "muted" as const,
		},
	}[currentStatus];
	const checkedLabel = lastCheckedAt
		? `Last checked ${LAST_CHECK_FORMATTER.format(new Date(lastCheckedAt))}`
		: "No completed checks";

	return (
		<div
			className="scroll-mt-20 overflow-hidden rounded-xl border border-border/60 bg-card"
			data-slot="status-section"
			id={anchorId}
		>
			<button
				aria-controls={panelId}
				aria-expanded={isOpen}
				className="flex w-full cursor-pointer select-none items-center gap-2 p-4 text-left outline-none transition-colors duration-(--duration-quick) ease-(--ease-smooth) hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:gap-3 sm:p-5"
				onClick={() => setIsOpen((open) => !open)}
				type="button"
			>
				<div className="shrink-0 p-1">
					<CaretDownIcon
						className={cn(
							"size-3 -rotate-90 text-muted-foreground transition-transform duration-(--duration-base) ease-(--expo-out)",
							isOpen && "rotate-0"
						)}
					/>
				</div>
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold text-sm sm:text-base">
						{name}
						{domain ? (
							<span className="font-normal text-muted-foreground">
								{" "}
								{domain}
							</span>
						) : null}
					</span>
				</div>
				<span
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs"
					title={checkedLabel}
				>
					<StatusDot color={statusConfig.color} size="sm" />
					{statusConfig.label}
				</span>
			</button>

			<div
				aria-hidden={!isOpen}
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-(--duration-base) ease-(--expo-out) motion-reduce:transition-none",
					isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
				id={panelId}
				inert={isOpen ? undefined : true}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="px-4 pt-1 pb-2 sm:px-5">
						{uptimePercentage === undefined ? null : (
							<div>
								<UptimeHeatmapStrip
									days={buildUptimeHeatmapDays(dailyData, days)}
									emptyLabel="No data recorded"
									interactive
									isActive
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
						)}
						{hasLatencyData ? (
							<div
								className={cn(
									uptimePercentage !== undefined &&
										"mt-3 border-border/60 border-t"
								)}
							>
								<div className="-mx-2">
									<LatencyChart
										data={dailyData}
										storageKey={`status-latency-${id}`}
									/>
								</div>
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
