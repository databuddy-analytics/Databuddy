import { StatusDot } from "@databuddy/ui";
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
	lastCheckedAt,
	name,
	status,
	uptimePercentage,
}: MonitorCardInteractiveProps) {
	const statusConfig = {
		up: { label: "Operational", color: "success" as const },
		degraded: { label: "Degraded", color: "warning" as const },
		down: { label: "Down", color: "destructive" as const },
		unknown: {
			label: freshness === "stale" ? "Data stale" : "Unknown",
			color: "muted" as const,
		},
	}[status];
	const checkedLabel = lastCheckedAt
		? `Last checked ${LAST_CHECK_FORMATTER.format(new Date(lastCheckedAt))}`
		: "No completed checks";

	return (
		<div
			className="scroll-mt-20 px-4 py-4 sm:px-5 sm:py-5"
			data-slot="status-monitor"
			id={anchorId}
		>
			<div className="flex items-center justify-between gap-4">
				<p className="min-w-0 truncate font-medium text-sm">
					{name}
					{domain ? (
						<span className="font-normal text-muted-foreground"> {domain}</span>
					) : null}
				</p>
				<span
					className="flex shrink-0 items-center gap-1.5 text-muted-foreground text-xs"
					title={checkedLabel}
				>
					<StatusDot color={statusConfig.color} size="md" />
					{statusConfig.label}
				</span>
			</div>

			{uptimePercentage === undefined ? null : (
				<div className="mt-3">
					<UptimeHistory
						dailyData={dailyData}
						days={days}
						uptimePercentage={uptimePercentage}
					/>
				</div>
			)}
		</div>
	);
}
