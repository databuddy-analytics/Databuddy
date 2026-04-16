import { formatDailyDowntime } from "./implied-downtime";

export const uptimeHeatmapTooltipContentClassName =
	"max-w-[min(17rem,85vw)] px-3 py-2.5 text-sm shadow-md";

interface UptimeHeatmapDayTooltipBodyProps {
	dateLabel: string;
	downtimeSeconds?: number;
	emptyLabel?: string;
	hasData: boolean;
	successfulChecks?: number;
	totalChecks?: number;
	uptimePercent: number;
}

export function UptimeHeatmapDayTooltipBody({
	dateLabel,
	hasData,
	uptimePercent,
	downtimeSeconds,
	totalChecks,
	successfulChecks,
	emptyLabel = "No data for this day",
}: UptimeHeatmapDayTooltipBodyProps) {
	return (
		<div className="flex flex-col gap-2.5 text-pretty">
			<p className="text-balance font-medium text-accent text-sm leading-snug">
				{dateLabel}
			</p>
			{hasData ? (
				<div className="flex flex-col gap-2 border-accent/20 border-t pt-2">
					<div className="flex items-baseline justify-between gap-6">
						<span className="shrink-0 text-accent/75 text-xs">Uptime</span>
						<span className="font-mono font-semibold text-accent text-sm tabular-nums leading-none">
							{uptimePercent.toFixed(2)}%
						</span>
					</div>
					{downtimeSeconds === undefined ? null : (
						<div className="flex items-baseline justify-between gap-6">
							<span className="shrink-0 text-accent/75 text-xs">Down</span>
							<span className="font-mono text-accent text-sm tabular-nums leading-none">
								{formatDailyDowntime(downtimeSeconds)}
							</span>
						</div>
					)}
					{totalChecks === undefined ? null : (
						<div className="flex items-baseline justify-between gap-6">
							<span className="shrink-0 text-accent/75 text-xs">Checks</span>
							<span className="font-mono text-accent text-sm tabular-nums leading-none">
								{successfulChecks}/{totalChecks}
							</span>
						</div>
					)}
				</div>
			) : (
				<p className="text-accent/85 text-sm leading-snug">{emptyLabel}</p>
			)}
		</div>
	);
}
