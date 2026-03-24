"use client";

import { METRIC_COLORS } from "@/components/charts/metrics-constants";

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
		<div className="min-w-[160px] rounded border bg-popover p-2.5 shadow-lg">
			{label && (
				<div className="mb-2 flex items-center gap-2 border-b pb-2">
					<div className="size-1.5 animate-pulse rounded-full bg-chart-1" />
					<p className="font-medium text-foreground text-xs">{label}</p>
				</div>
			)}
			<div className="space-y-1">
				{payload.map((entry) => {
					const color =
						entry.dataKey === "events"
							? METRIC_COLORS.pageviews.primary
							: METRIC_COLORS.visitors.primary;

					return (
						<div
							className="flex items-center justify-between gap-3"
							key={entry.dataKey}
						>
							<div className="flex items-center gap-1.5">
								<div
									className="size-2 rounded-full"
									style={{ backgroundColor: color }}
								/>
								<span className="text-muted-foreground text-xs">
									{entry.name}
								</span>
							</div>
							<span className="font-semibold text-foreground text-xs tabular-nums">
								{entry.value.toLocaleString()}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
