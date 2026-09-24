"use client";

import { useId, useState } from "react";
import { cn, StatusDot } from "@databuddy/ui";
import { CaretDownIcon } from "@databuddy/ui/icons";
import { LatencyChart } from "@databuddy/ui/uptime";
import { type MonitorDailyData, UptimeHistory } from "./uptime-history";

const LAST_CHECK_FORMATTER = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	month: "short",
	timeZone: "UTC",
	timeZoneName: "short",
});

export interface MonitorCardInteractiveProps {
	anchorId: string;
	dailyData: MonitorDailyData;
	days: number;
	domain?: string;
	freshness: "fresh" | "stale" | "unknown";
	id: string;
	lastCheckedAt: string | null;
	name: string;
	status: "up" | "down" | "degraded" | "unknown";
	uptimePercentage?: number;
}

export function MonitorCardInteractive({
	anchorId,
	dailyData,
	days,
	domain,
	freshness,
	id,
	lastCheckedAt,
	name,
	status,
	uptimePercentage,
}: MonitorCardInteractiveProps) {
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
	}[status];
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
							<UptimeHistory
								dailyData={dailyData}
								days={days}
								uptimePercentage={uptimePercentage}
							/>
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
