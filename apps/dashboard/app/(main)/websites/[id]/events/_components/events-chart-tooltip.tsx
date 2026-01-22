"use client";

import { METRIC_COLORS } from"@/components/charts/metrics-constants";

interface TooltipPayload {
	dataKey: string;
	value: number;
	color: string;
	name: string;
}

interface EventsChartTooltipProps {
	active?: boolean;
	payload?: TooltipPayload[];
	label?: string;
}

export function EventsChartTooltip({
	active,
	payload,
	label,
}: EventsChartTooltipProps) {
	if (!(active && payload?.length)) {
		return null;
	}

	return (
		<div className=" border bg-popover px-3 py-2 shadow-md">
			<p className="mb-1 font-medium text-popover-foreground text-xs">
				{label}
			</p>
			<div className="space-y-1">
				{payload.map((entry) => {
					const color =
						entry.dataKey ==="events"
							? METRIC_COLORS.pageviews.primary
							: METRIC_COLORS.visitors.primary;

					return (
						<div
							className="flex items-center justify-between gap-4"
							key={entry.dataKey}
						>
							<div className="flex items-center gap-1.5">
								<div
									className="size-2"
									style={{ backgroundColor: color }}
								/>
								<span className="text-muted-foreground text-xs">
									{entry.name}
								</span>
							</div>
							<span className="font-medium text-popover-foreground text-xs tabular-nums">
								{entry.value.toLocaleString()}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
