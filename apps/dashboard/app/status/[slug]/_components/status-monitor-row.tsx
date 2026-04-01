import {
	CheckCircleIcon,
	MinusCircleIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { LastChecked } from "./last-checked";
import { MonitorRowInteractive } from "./monitor-row-interactive";

interface DailyData {
	date: string;
	uptime_percentage: number;
	avg_response_time?: number;
	p95_response_time?: number;
}

interface PublicMonitor {
	id: string;
	name: string;
	domain: string | null;
	currentStatus: "up" | "down" | "degraded" | "unknown";
	uptimePercentage: number;
	dailyData: DailyData[];
	lastCheckedAt: string | null;
	showLink: boolean;
	showLatency: boolean;
	showUptimePct: boolean;
	showStatus: boolean;
	showLastChecked: boolean;
}

const STATUS_ICON = {
	up: {
		Icon: CheckCircleIcon,
		className: "text-emerald-500",
		label: "Operational",
	},
	degraded: {
		Icon: WarningCircleIcon,
		className: "text-amber-500",
		label: "Degraded",
	},
	down: { Icon: XCircleIcon, className: "text-red-500", label: "Down" },
	unknown: {
		Icon: MinusCircleIcon,
		className: "text-muted-foreground",
		label: "Unknown",
	},
} as const;

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

interface StatusMonitorRowProps {
	monitor: PublicMonitor;
	days: number;
}

export function StatusMonitorRow({ monitor, days }: StatusMonitorRowProps) {
	const statusConfig = STATUS_ICON[monitor.currentStatus];
	const hasLatencyData =
		monitor.showLatency &&
		monitor.dailyData.some(
			(d) => d.avg_response_time != null || d.p95_response_time != null
		);

	return (
		<div
			className="scroll-mt-20 overflow-hidden rounded border bg-card"
			id={slugify(monitor.name)}
		>
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<div className="flex items-center gap-2.5 overflow-hidden">
					{monitor.showStatus ? (
						<statusConfig.Icon
							className={cn("size-5 shrink-0", statusConfig.className)}
							weight="fill"
						/>
					) : null}
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{monitor.name}</p>
						{monitor.showLink && monitor.domain ? (
							<p className="truncate text-muted-foreground text-xs">
								{monitor.domain}
							</p>
						) : null}
					</div>
				</div>
				<div className="shrink-0 text-right">
					{monitor.showUptimePct ? (
						<p className="font-medium font-mono text-sm tabular-nums">
							{monitor.uptimePercentage.toFixed(2)}%
						</p>
					) : null}
					{monitor.showLastChecked && monitor.lastCheckedAt ? (
						<LastChecked timestamp={monitor.lastCheckedAt} />
					) : null}
				</div>
			</div>

			<MonitorRowInteractive
				dailyData={monitor.dailyData}
				days={days}
				hasLatencyData={hasLatencyData}
				id={monitor.id}
			/>
		</div>
	);
}
