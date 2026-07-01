"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "@databuddy/ui";
import { CaretDownIcon } from "@databuddy/ui/icons";
import {
	type MonitorDailyData,
	MonitorRowInteractive,
} from "./monitor-row-interactive";

export interface MonitorCardInteractiveProps {
	anchorId: string;
	dailyData: MonitorDailyData;
	days: number;
	domain?: string;
	id: string;
	name: string;
	uptimePercentage?: number;
}

function uptimeColor(pct: number): string {
	if (pct >= 99.9) {
		return "text-emerald-600 dark:text-emerald-400";
	}
	if (pct >= 99) {
		return "text-amber-600 dark:text-amber-400";
	}
	return "text-red-600 dark:text-red-400";
}

export function MonitorCardInteractive({
	anchorId,
	dailyData,
	days,
	domain,
	id,
	name,
	uptimePercentage,
}: MonitorCardInteractiveProps) {
	const [isOpen, setIsOpen] = useState(true);
	const panelId = useId();
	const hasLatencyData = useMemo(
		() =>
			dailyData.some(
				(d) => d.avg_response_time != null || d.p95_response_time != null
			),
		[dailyData]
	);

	return (
		<div
			className="scroll-mt-20 overflow-hidden rounded-xl border border-border/60 bg-card"
			data-slot="status-section"
			id={anchorId}
		>
			<button
				aria-controls={panelId}
				aria-expanded={isOpen}
				className="relative z-20 flex w-full cursor-pointer select-none items-start gap-2 overflow-hidden rounded-t-xl rounded-b-none bg-card p-3 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:gap-3 sm:p-4"
				onClick={() => setIsOpen((open) => !open)}
				type="button"
			>
				<div className="shrink-0 p-1">
					<CaretDownIcon
						className={cn(
							"size-3 -rotate-90 text-muted-foreground transition-transform duration-200 ease-out",
							isOpen && "rotate-0"
						)}
					/>
				</div>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<span className="min-w-0 flex-1 truncate font-semibold text-sm leading-[1.2] sm:text-base">
						<span>{name}</span>
						{domain && (
							<span className="font-normal text-muted-foreground">
								{" "}
								({domain})
							</span>
						)}
					</span>
					{uptimePercentage !== undefined && (
						<span
							className={cn(
								"shrink-0 font-medium text-sm tabular-nums leading-[1.2] sm:text-base",
								uptimeColor(uptimePercentage)
							)}
						>
							{uptimePercentage.toFixed(2)}% uptime
						</span>
					)}
				</div>
			</button>

			<div
				aria-hidden={!isOpen}
				className={cn(
					"grid bg-muted/30 transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
					isOpen
						? "grid-rows-[1fr] border-border/60 border-t opacity-100"
						: "grid-rows-[0fr] opacity-0"
				)}
				id={panelId}
				inert={isOpen ? undefined : true}
			>
				<div className="min-h-0 overflow-hidden">
					<div className="px-5 py-5 sm:px-6 sm:py-6">
						<MonitorRowInteractive
							dailyData={dailyData}
							days={days}
							hasLatencyData={hasLatencyData}
							hasUptimeData={uptimePercentage !== undefined}
							id={id}
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
