import {
	CheckCircleIcon,
	MinusCircleIcon,
	WarningCircleIcon,
	XCircleIcon,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LastChecked } from "./last-checked";
import { MonitorRowInteractive } from "./monitor-row-interactive";

interface StatusRootProps {
	children: ReactNode;
	className?: string;
}

function StatusRoot({ children, className }: StatusRootProps) {
	return (
		<div className={cn("space-y-6", className)} data-slot="status-page">
			{children}
		</div>
	);
}

interface StatusHeaderProps {
	children?: ReactNode;
	className?: string;
	description?: string;
	logoUrl?: string | null;
	name: string;
	websiteUrl?: string | null;
}

function StatusHeader({
	name,
	description = "System status and uptime",
	logoUrl,
	websiteUrl,
	children,
	className,
}: StatusHeaderProps) {
	const heading = (
		<h1 className="text-balance font-semibold text-2xl tracking-tight">
			{name}
		</h1>
	);

	return (
		<div
			className={cn("flex items-center gap-3.5", className)}
			data-slot="status-header"
		>
			{logoUrl ? (
				<Image
					alt=""
					className="size-10 shrink-0 rounded object-contain"
					height={40}
					src={logoUrl}
					unoptimized
					width={40}
				/>
			) : null}
			<div className="min-w-0 flex-1">
				{websiteUrl ? (
					<a
						className="transition-opacity hover:opacity-80"
						href={websiteUrl}
						rel="noopener noreferrer"
						target="_blank"
					>
						{heading}
					</a>
				) : (
					heading
				)}
				<p className="mt-0.5 text-pretty text-muted-foreground text-sm">
					{description}
				</p>
			</div>
			{children}
		</div>
	);
}

const BANNER_CONFIG = {
	operational: {
		label: "All Systems Operational",
		bgClass: "bg-emerald-500/10 border-emerald-500/20",
		textClass: "text-emerald-600 dark:text-emerald-400",
		dotClass: "bg-emerald-500",
		Icon: CheckCircleIcon,
		pulse: true,
	},
	degraded: {
		label: "Partial System Outage",
		bgClass: "bg-amber-500/10 border-amber-500/20",
		textClass: "text-amber-600 dark:text-amber-400",
		dotClass: "bg-amber-500",
		Icon: WarningCircleIcon,
		pulse: false,
	},
	outage: {
		label: "Major System Outage",
		bgClass: "bg-red-500/10 border-red-500/20",
		textClass: "text-red-600 dark:text-red-400",
		dotClass: "bg-red-500",
		Icon: XCircleIcon,
		pulse: false,
	},
} as const;

interface StatusBannerProps {
	className?: string;
	status: "operational" | "degraded" | "outage";
}

function StatusBanner({ status, className }: StatusBannerProps) {
	const config = BANNER_CONFIG[status];

	return (
		<div
			className={cn(
				"flex items-center gap-3 rounded border p-4",
				config.bgClass,
				className
			)}
			data-slot="status-banner"
		>
			<div className="relative flex shrink-0 items-center justify-center">
				{config.pulse ? (
					<span
						className={cn(
							"absolute size-6 animate-ping rounded-full opacity-20",
							config.dotClass
						)}
					/>
				) : null}
				<config.Icon
					className={cn("relative size-6 shrink-0", config.textClass)}
					weight="fill"
				/>
			</div>
			<span className={cn("font-semibold text-sm", config.textClass)}>
				{config.label}
			</span>
		</div>
	);
}

interface StatusSectionProps {
	action?: ReactNode;
	children: ReactNode;
	className?: string;
	title: string;
}

function StatusSection({
	title,
	children,
	action,
	className,
}: StatusSectionProps) {
	return (
		<div className={className} data-slot="status-section">
			<div className="flex items-center justify-between">
				<h2 className="font-semibold text-sm">{title}</h2>
				{action}
			</div>
			<div className="mt-3 space-y-3">{children}</div>
		</div>
	);
}

const MONITOR_STATUS = {
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

interface DailyData {
	avg_response_time?: number;
	date: string;
	p95_response_time?: number;
	uptime_percentage?: number;
}

interface StatusMonitorCardProps {
	anchorId: string;
	currentStatus: "up" | "down" | "degraded" | "unknown";
	dailyData: DailyData[];
	days: number;
	domain?: string;
	id: string;
	lastCheckedAt: string | null;
	name: string;
	uptimePercentage?: number;
}

function StatusMonitorCard({
	id,
	anchorId,
	name,
	domain,
	currentStatus,
	uptimePercentage,
	dailyData,
	days,
	lastCheckedAt,
}: StatusMonitorCardProps) {
	const statusConfig = MONITOR_STATUS[currentStatus];
	const hasLatencyData = dailyData.some(
		(d) => d.avg_response_time != null || d.p95_response_time != null
	);

	return (
		<div
			className="scroll-mt-20 overflow-hidden rounded border bg-card"
			data-slot="status-monitor-card"
			id={anchorId}
		>
			<div className="flex items-center justify-between px-4 pt-4 pb-3">
				<div className="flex items-center gap-2.5 overflow-hidden">
					<statusConfig.Icon
						className={cn("size-5 shrink-0", statusConfig.className)}
						weight="fill"
					/>
					<div className="min-w-0">
						<p className="truncate font-medium text-sm">{name}</p>
						{domain && (
							<p className="truncate text-muted-foreground text-xs">{domain}</p>
						)}
					</div>
				</div>
				<div className="shrink-0 text-right">
					{uptimePercentage !== undefined && (
						<p className="font-medium font-mono text-sm tabular-nums">
							{uptimePercentage.toFixed(2)}%
						</p>
					)}
					{lastCheckedAt ? <LastChecked timestamp={lastCheckedAt} /> : null}
				</div>
			</div>

			<MonitorRowInteractive
				dailyData={dailyData}
				days={days}
				hasLatencyData={hasLatencyData}
				hasUptimeData={uptimePercentage !== undefined}
				id={id}
			/>
		</div>
	);
}

function StatusIncidents({ className }: { className?: string }) {
	return (
		<div
			className={cn("rounded border bg-card p-6", className)}
			data-slot="status-incidents"
		>
			<h2 className="text-balance font-semibold text-sm">Recent Incidents</h2>
			<div className="mt-4 flex items-center gap-2.5 text-muted-foreground">
				<CheckCircleIcon
					className="size-4 shrink-0 text-emerald-500"
					weight="fill"
				/>
				<p className="text-pretty text-sm">
					No incidents reported in the last 90 days.
				</p>
			</div>
		</div>
	);
}

StatusRoot.displayName = "Status";

export const Status: typeof StatusRoot & {
	Banner: typeof StatusBanner;
	Header: typeof StatusHeader;
	Incidents: typeof StatusIncidents;
	MonitorCard: typeof StatusMonitorCard;
	Section: typeof StatusSection;
} = Object.assign(StatusRoot, {
	Banner: StatusBanner,
	Header: StatusHeader,
	Incidents: StatusIncidents,
	MonitorCard: StatusMonitorCard,
	Section: StatusSection,
});
