"use client";

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../utils";
import { getUptimeHeatmapCellClass } from "./heatmap-cell-class";
import { UptimeHeatmapDayTooltipBody } from "./heatmap-day-tooltip";
import type { UptimeHeatmapDay } from "./heatmap-days";

type UptimeSeverity =
	| "empty"
	| "operational"
	| "degraded"
	| "partial"
	| "major";

type TooltipState = {
	above: boolean;
	index: number;
	left: number;
	top: number;
};

type Segment = {
	length: number;
	severity: UptimeSeverity;
	start: number;
};

export type UptimeHeatmapStripVariant = "segments" | "cells";

export interface UptimeHeatmapStripProps {
	days: UptimeHeatmapDay[];
	emptyLabel: string;
	getDateLabel?: (date: Date) => string;
	interactive: boolean;
	isActive: boolean;
	stripClassName?: string;
	tooltipHasData?: (day: UptimeHeatmapDay) => boolean;
	variant?: UptimeHeatmapStripVariant;
}

const TOOLTIP_WIDTH = 224;
const TOOLTIP_GUTTER = 12;
const TOOLTIP_HIDE_MS = 120;
const TOOLTIP_Z_INDEX = 2_147_483_647;

const SEGMENT_COLORS: Record<UptimeSeverity, string> = {
	empty: "color-mix(in oklab, var(--muted) 78%, var(--foreground) 14%)",
	operational: "#06c652",
	degraded: "#fbbf24",
	partial: "#fb8f24",
	major: "#ff2b3c",
};

function tintStatusColor(color: string, amount: number) {
	return `color-mix(in oklab, var(--popover) ${100 - amount}%, ${color} ${amount}%)`;
}

const SEVERITY_META: Record<
	UptimeSeverity,
	{ accent: string; background: string; label: string }
> = {
	empty: {
		accent: "var(--muted-foreground)",
		background: tintStatusColor("var(--muted-foreground)", 14),
		label: "No Data",
	},
	operational: {
		accent: SEGMENT_COLORS.operational,
		background: tintStatusColor(SEGMENT_COLORS.operational, 18),
		label: "Operational",
	},
	degraded: {
		accent: SEGMENT_COLORS.degraded,
		background: tintStatusColor(SEGMENT_COLORS.degraded, 20),
		label: "Degraded Performance",
	},
	partial: {
		accent: SEGMENT_COLORS.partial,
		background: tintStatusColor(SEGMENT_COLORS.partial, 18),
		label: "Partial Outage",
	},
	major: {
		accent: SEGMENT_COLORS.major,
		background: tintStatusColor(SEGMENT_COLORS.major, 16),
		label: "Major Outage",
	},
};

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function getSeverity(
	day: Pick<UptimeHeatmapDay, "hasData" | "uptime">,
	isActive: boolean
): UptimeSeverity {
	if (!(isActive && day.hasData)) {
		return "empty";
	}
	if (day.uptime >= 99.9) {
		return "operational";
	}
	if (day.uptime >= 99) {
		return "degraded";
	}
	if (day.uptime >= 90) {
		return "partial";
	}
	return "major";
}

function buildSegments(days: UptimeHeatmapDay[], isActive: boolean): Segment[] {
	const segments: Segment[] = [];

	for (const [index, day] of days.entries()) {
		const severity = getSeverity(day, isActive);
		const previous = segments.at(-1);

		if (previous?.severity === severity) {
			previous.length += 1;
			continue;
		}

		segments.push({ length: 1, severity, start: index + 1 });
	}

	return segments;
}

function formatDowntime(seconds: number): string {
	if (seconds < 60) {
		return "<1 min";
	}

	const minutes = Math.round(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	if (hours === 0) {
		return `${minutes} min${minutes === 1 ? "" : "s"}`;
	}
	if (remainingMinutes === 0) {
		return `${hours} hr${hours === 1 ? "" : "s"}`;
	}
	return `${hours} hr${hours === 1 ? "" : "s"} ${remainingMinutes} min${remainingMinutes === 1 ? "" : "s"}`;
}

function getOrdinalSuffix(day: number) {
	if (day >= 11 && day <= 13) {
		return "th";
	}
	switch (day % 10) {
		case 1:
			return "st";
		case 2:
			return "nd";
		case 3:
			return "rd";
		default:
			return "th";
	}
}

function formatLongDate(date: Date): string {
	const day = date.getDate();

	return `${date.toLocaleDateString("en-US", {
		month: "long",
	})} ${day}${getOrdinalSuffix(day)} ${date.getFullYear()}`;
}

function getTooltipTransform(state: TooltipState, isVisible: boolean) {
	if (state.above) {
		return isVisible
			? "translate(-50%, -100%) scale(1)"
			: "translate(-50%, calc(-100% + 4px)) scale(0.96)";
	}

	return isVisible
		? "translate(-50%, 0) scale(1)"
		: "translate(-50%, 4px) scale(0.96)";
}

function SegmentTooltip({
	day,
	emptyLabel,
	isActive,
	isVisible,
	state,
	showData,
}: {
	day: UptimeHeatmapDay;
	emptyLabel: string;
	isActive: boolean;
	isVisible: boolean;
	showData: boolean;
	state: TooltipState;
}) {
	const severity = getSeverity(day, isActive);
	const meta = SEVERITY_META[severity];
	const downtimeLabel =
		day.downtimeSeconds > 0 ? formatDowntime(day.downtimeSeconds) : null;

	return (
		<div
			className="pointer-events-none fixed w-56 overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground opacity-0 shadow-[0_24px_80px_-36px_rgba(0,0,0,0.72)] transition-[left,top,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
			role="tooltip"
			style={{
				left: state.left,
				opacity: isVisible ? 1 : 0,
				top: state.top,
				transform: getTooltipTransform(state, isVisible),
				transformOrigin: state.above ? "bottom center" : "top center",
				zIndex: TOOLTIP_Z_INDEX,
			}}
		>
			<div
				className="border-border/60 border-b px-3.5 py-3 text-popover-foreground transition-colors duration-200"
				style={{
					background: meta.background,
				}}
			>
				<div className="flex items-center gap-2">
					<span
						aria-hidden
						className="size-2 rounded-full ring-1 ring-popover/80"
						style={{ background: meta.accent }}
					/>
					<span className="font-semibold text-sm leading-[1.2]">
						{meta.label}
					</span>
				</div>
				<span className="mt-1 block font-medium text-popover-foreground text-xs tabular-nums leading-[1.2]">
					{showData ? `${day.uptime.toFixed(2)}% uptime` : emptyLabel}
				</span>
			</div>

			<div className="px-3.5 py-3">
				<div className="font-semibold text-sm tabular-nums leading-[1.2]">
					{formatLongDate(day.date)}
				</div>
				{showData && downtimeLabel ? (
					<p className="mt-2 text-muted-foreground text-xs tabular-nums leading-[1.2]">
						{downtimeLabel} downtime recorded
					</p>
				) : null}
			</div>
		</div>
	);
}

function getActiveSegmentOffset(segment: Segment, activeIndex: number) {
	return ((activeIndex + 1 - segment.start) / segment.length) * 100;
}

function getHoveredIndex(rect: DOMRect, pointerX: number, itemCount: number) {
	const cellWidth = rect.width / itemCount;

	return clamp(
		Math.floor((pointerX - rect.left) / cellWidth),
		0,
		itemCount - 1
	);
}

function getTooltipPlacement({
	index,
	itemCount,
	pointerX,
	rect,
	viewportHeight,
	viewportWidth,
}: {
	index?: number;
	itemCount: number;
	pointerX?: number;
	rect: DOMRect;
	viewportHeight: number;
	viewportWidth: number;
}): TooltipState {
	const resolvedIndex =
		index ?? getHoveredIndex(rect, pointerX ?? rect.left, itemCount);
	const cellWidth = rect.width / itemCount;
	const tooltipHalfWidth = TOOLTIP_WIDTH / 2;
	const left = clamp(
		rect.left + (resolvedIndex + 0.5) * cellWidth,
		tooltipHalfWidth + TOOLTIP_GUTTER,
		viewportWidth - tooltipHalfWidth - TOOLTIP_GUTTER
	);
	const above = viewportHeight - rect.bottom < 260 && rect.top > 180;

	return {
		above,
		index: resolvedIndex,
		left,
		top: above ? rect.top - 10 : rect.bottom + 10,
	};
}

function getSegmentDayLabel(
	day: UptimeHeatmapDay,
	emptyLabel: string,
	isActive: boolean
) {
	const severity = SEVERITY_META[getSeverity(day, isActive)].label;
	const uptime =
		isActive && day.hasData ? `${day.uptime.toFixed(2)}% uptime` : emptyLabel;
	const downtime =
		isActive && day.downtimeSeconds > 0
			? `, ${formatDowntime(day.downtimeSeconds)} downtime`
			: "";
	return `${formatLongDate(day.date)}, ${severity}, ${uptime}${downtime}`;
}

function SegmentedUptimeStrip({
	days,
	interactive,
	isActive,
	stripClassName,
	emptyLabel,
	tooltipHasData,
}: UptimeHeatmapStripProps) {
	const gridRef = useRef<HTMLFieldSetElement>(null);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);
	const [isTooltipVisible, setIsTooltipVisible] = useState(false);
	const segments = useMemo(() => buildSegments(days, isActive), [days, isActive]);
	const activeDay = tooltip ? days[tooltip.index] : null;
	const gridStyle = {
		gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
	};
	const gridClassName =
		stripClassName ??
		"relative -my-3 grid cursor-pointer gap-x-px border-0 px-0 py-3 sm:gap-x-[2px]";

	const clearHideTimer = useCallback(() => {
		if (hideTimerRef.current) {
			clearTimeout(hideTimerRef.current);
			hideTimerRef.current = null;
		}
	}, []);

	const hideTooltip = useCallback(() => {
		clearHideTimer();
		setIsTooltipVisible(false);
		hideTimerRef.current = setTimeout(() => {
			setTooltip(null);
		}, TOOLTIP_HIDE_MS);
	}, [clearHideTimer]);

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLFieldSetElement>) => {
			const grid = gridRef.current;

			if (!(grid && days.length > 0)) {
				return;
			}

			clearHideTimer();
			setTooltip(
				getTooltipPlacement({
					itemCount: days.length,
					pointerX: event.clientX,
					rect: grid.getBoundingClientRect(),
					viewportHeight: window.innerHeight,
					viewportWidth: window.innerWidth,
				})
			);
			setIsTooltipVisible(true);
		},
		[clearHideTimer, days.length]
	);

	const handleDayFocus = useCallback(
		(index: number) => {
			const grid = gridRef.current;

			if (!(grid && days.length > 0)) {
				return;
			}

			clearHideTimer();
			setTooltip(
				getTooltipPlacement({
					index,
					itemCount: days.length,
					rect: grid.getBoundingClientRect(),
					viewportHeight: window.innerHeight,
					viewportWidth: window.innerWidth,
				})
			);
			setIsTooltipVisible(true);
		},
		[clearHideTimer, days.length]
	);

	useEffect(
		() => () => {
			clearHideTimer();
		},
		[clearHideTimer]
	);

	const segmentNodes = segments.map((segment) => {
		const activeIndex = tooltip?.index ?? null;
		const containsActive =
			activeIndex !== null &&
			activeIndex + 1 >= segment.start &&
			activeIndex + 1 < segment.start + segment.length;

		return (
			<div
				aria-hidden
				className="relative h-1.5 overflow-hidden rounded-full"
				key={`${segment.start}-${segment.length}-${segment.severity}`}
				style={{
					background: SEGMENT_COLORS[segment.severity],
					gridColumn: `${segment.start} / span ${segment.length}`,
				}}
			>
				<div
					className="pointer-events-none absolute inset-y-0 transition-[left,opacity] duration-100 ease-[cubic-bezier(0.2,0,0,1)]"
					style={{
						background:
							"var(--status-bar-active-overlay, color-mix(in oklab, var(--foreground) 22%, transparent))",
						left:
							activeIndex === null
								? 0
								: `${getActiveSegmentOffset(segment, activeIndex)}%`,
						opacity: containsActive && isTooltipVisible ? 1 : 0,
						width: `${100 / segment.length}%`,
					}}
				/>
			</div>
		);
	});

	if (!interactive) {
		return (
			<div className={cn("grid gap-x-px", gridClassName)} style={gridStyle}>
				{segmentNodes}
			</div>
		);
	}

	const showData = activeDay
		? (tooltipHasData?.(activeDay) ?? (isActive && activeDay.hasData))
		: false;

	return (
		<>
			<fieldset
				aria-label={`${days.length} day uptime history`}
				className={cn("relative grid", gridClassName)}
				onPointerLeave={hideTooltip}
				onPointerMove={handlePointerMove}
				ref={gridRef}
				style={gridStyle}
			>
				{segmentNodes}
				<div
					className="pointer-events-none absolute inset-y-3 right-0 left-0 grid gap-x-px sm:gap-x-[2px]"
					style={gridStyle}
				>
					{days.map((day, index) => (
						<button
							aria-label={getSegmentDayLabel(day, emptyLabel, isActive)}
							className="h-full rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							key={day.dateStr}
							onBlur={hideTooltip}
							onFocus={() => handleDayFocus(index)}
							type="button"
						/>
					))}
				</div>
			</fieldset>
			{typeof document !== "undefined" && activeDay && tooltip ? (
				createPortal(
					<SegmentTooltip
						day={activeDay}
						emptyLabel={emptyLabel}
						isActive={isActive}
						isVisible={isTooltipVisible}
						showData={showData}
						state={tooltip}
					/>,
					document.body
				)
			) : null}
		</>
	);
}

function CellUptimeStrip({
	days,
	interactive,
	isActive,
	stripClassName,
	emptyLabel,
	getDateLabel,
	tooltipHasData,
}: UptimeHeatmapStripProps) {
	const [activeDay, setActiveDay] = useState<UptimeHeatmapDay | null>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const stripRef = useRef<HTMLDivElement>(null);
	const className = stripClassName ?? "flex h-8 w-full gap-px sm:gap-[2px]";

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const target =
				(e.target as HTMLElement).closest<HTMLElement>("[data-idx]") ??
				(e.target as HTMLElement);
			const idx = target.dataset.idx;
			if (idx == null) {
				return;
			}
			const day = days[Number(idx)];
			if (!day) {
				return;
			}
			setActiveDay(day);
			const rect = stripRef.current?.getBoundingClientRect();
			if (rect) {
				const targetRect = target.getBoundingClientRect();
				setPos({
					x: targetRect.left + targetRect.width / 2 - rect.left,
					y: 0,
				});
			}
		},
		[days]
	);

	const handlePointerLeave = useCallback(() => setActiveDay(null), []);

	if (!interactive) {
		return (
			<div className={className}>
				{days.map((day) => (
					<div
						className={cn(
							"h-full flex-1 rounded-sm transition-colors",
							getUptimeHeatmapCellClass({
								uptimePercent: day.uptime,
								hasData: day.hasData,
								isActive,
								interactive: false,
							})
						)}
						key={day.dateStr}
					/>
				))}
			</div>
		);
	}

	const showData = activeDay
		? (tooltipHasData?.(activeDay) ?? activeDay.hasData)
		: false;

	return (
		<div className="relative" ref={stripRef}>
			<div
				className={className}
				onPointerLeave={handlePointerLeave}
				onPointerMove={handlePointerMove}
			>
				{days.map((day, i) => (
					<div
						className={cn(
							"h-full flex-1 rounded-sm transition-colors",
							getUptimeHeatmapCellClass({
								uptimePercent: day.uptime,
								hasData: day.hasData,
								isActive,
								interactive: true,
							})
						)}
						data-idx={i}
						key={day.dateStr}
					/>
				))}
			</div>

			{activeDay && (
				<div
					className="pointer-events-none absolute bottom-full mb-2"
					style={{
						left: pos.x,
						transform: "translateX(-50%)",
						zIndex: TOOLTIP_Z_INDEX,
					}}
				>
					<div className="rounded-lg border border-border/60 bg-popover px-3 py-2.5 text-popover-foreground text-sm shadow-md">
						<UptimeHeatmapDayTooltipBody
							dateLabel={getDateLabel?.(activeDay.date) ?? formatLongDate(activeDay.date)}
							downtimeSeconds={activeDay.downtimeSeconds}
							emptyLabel={emptyLabel}
							hasData={showData}
							uptimePercent={activeDay.uptime}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

export function UptimeHeatmapStrip({
	variant = "segments",
	...props
}: UptimeHeatmapStripProps) {
	if (variant === "cells") {
		return <CellUptimeStrip {...props} />;
	}

	return <SegmentedUptimeStrip {...props} />;
}
