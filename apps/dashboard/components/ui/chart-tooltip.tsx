"use client";

import { cn } from "@/lib/utils";

type TooltipEntry = {
	key: string;
	label: string;
	value: number;
	color: string;
	formattedValue?: string;
};

type ChartTooltipProps = {
	/** Whether the tooltip is active/visible */
	active?: boolean;
	/** The label for this data point (usually date) */
	label?: string;
	/** Format the label (e.g., date formatting) */
	formatLabelAction?: (label: string) => string;
	/** Entries to display in the tooltip */
	entries?: TooltipEntry[];
	/** Single value mode (simpler display) */
	singleValue?: {
		value: number;
		formattedValue?: string;
		label?: string;
	};
	/** Additional className for the container */
	className?: string;
};

/**
 * Reusable chart tooltip component
 * Supports both single-value (stat-card style) and multi-value (metrics-chart style)
 */
export function ChartTooltip({
	active,
	label,
	formatLabelAction,
	entries,
	singleValue,
	className,
}: ChartTooltipProps) {
	if (!active) return null;

	const displayLabel = label && formatLabelAction ? formatLabelAction(label) : label;

	// Single value mode (simpler, like stat-card)
	if (singleValue) {
		return (
			<div className={cn("rounded border bg-popover px-2 py-1.5 shadow-lg", className)}>
				{displayLabel && (
					<p className="text-[10px] text-muted-foreground">{displayLabel}</p>
				)}
				<p className="font-semibold text-foreground text-sm tabular-nums">
					{singleValue.formattedValue ?? singleValue.value.toLocaleString()}
					{singleValue.label && (
						<span className="ml-1 font-normal text-muted-foreground text-xs">
							{singleValue.label}
						</span>
					)}
				</p>
			</div>
		);
	}

	// Multi-value mode (like metrics-chart)
	if (!entries?.length) return null;

	return (
		<div className={cn("min-w-[160px] rounded border bg-popover p-2.5 shadow-lg", className)}>
			{displayLabel && (
				<div className="mb-2 flex items-center gap-2 border-b pb-2">
					<div className="size-1.5 animate-pulse rounded-full bg-primary" />
					<p className="font-medium text-foreground text-xs">{displayLabel}</p>
				</div>
			)}
			<div className="space-y-1">
				{entries.map((entry) => (
					<div className="flex items-center justify-between gap-3" key={entry.key}>
						<div className="flex items-center gap-1.5">
							<div
								className="size-2 rounded-full"
								style={{ backgroundColor: entry.color }}
							/>
							<span className="text-muted-foreground text-xs">{entry.label}</span>
						</div>
						<span className="font-semibold text-foreground text-xs tabular-nums">
							{entry.formattedValue ?? entry.value.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

/**
 * Helper to create entries from Recharts payload
 */
export function createTooltipEntries(
	payload: Array<{ dataKey: string; value: number; color: string }> | undefined,
	metrics: Array<{ key: string; label: string; color: string; formatValue?: (v: number) => string }>
): TooltipEntry[] {
	if (!payload?.length) return [];

	const entries: TooltipEntry[] = [];

	for (const p of payload) {
		const metric = metrics.find((m) => m.key === p.dataKey);
		if (!metric || p.value == null) continue;

		entries.push({
			key: p.dataKey,
			label: metric.label,
			value: p.value,
			color: p.color || metric.color,
			formattedValue: metric.formatValue ? metric.formatValue(p.value) : undefined,
		});
	}

	return entries;
}

/**
 * Default date formatter for tooltip labels
 */
export function formatTooltipDate(dateStr: string): string {
	try {
		return new Date(dateStr).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	} catch {
		return dateStr;
	}
}
