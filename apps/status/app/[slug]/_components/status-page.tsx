import type { AppRouter } from "@databuddy/rpc";
import type { OverallStatus } from "@databuddy/shared/uptime-status";
import type { RouterClient } from "@orpc/server";
import { Badge, cn, StatusDot } from "@databuddy/ui";
import {
	BoltLightningIcon,
	CaretDownIcon,
	CheckCircleIcon,
	CircleInfoIcon,
	ClockRotateIcon,
} from "@databuddy/ui/icons";

type StatusPageData = NonNullable<
	Awaited<ReturnType<RouterClient<AppRouter>["statusPage"]["getBySlug"]>>
>;
type Incident = StatusPageData["incidents"][number];

const STATUS_CONFIG = {
	operational: {
		title: "We're Fully Operational",
		shortLabel: "Operational",
		description: "We're not aware of any issues affecting these services.",
		sectionClass:
			"border-[#00cc414d] bg-[#e5fbeb] dark:border-[#3f8f55] dark:bg-[#17291d]",
		headerClass:
			"bg-[#00bd3c] text-white dark:bg-[#1f5f33] dark:text-[#d7ffe4]",
		lineClass: "bg-[#28e163] dark:bg-[#4da868]",
		textClass: "text-[#5b8368] dark:text-[#8bcf9d]",
	},
	degraded: {
		title: "Some Systems Degraded",
		shortLabel: "Degraded",
		description:
			"One or more services are degraded. We're tracking the impact.",
		sectionClass:
			"border-[#cc99004d] bg-[#fff9e7] dark:border-[#a8822e] dark:bg-[#2f2918]",
		headerClass:
			"bg-[#ffbe3d] text-[#332600] dark:bg-[#4f3d17] dark:text-[#ffe7ad]",
		lineClass: "bg-[#ffbe3d] dark:bg-[#f0ba4d]",
		textClass: "text-[#7f725e] dark:text-[#f0cf7a]",
	},
	outage: {
		title: "Service Disruption",
		shortLabel: "Outage",
		description: "An outage is affecting one or more services.",
		sectionClass:
			"border-[#cc00034d] bg-[#ffe8e8] dark:border-[#b85563] dark:bg-[#321c20]",
		headerClass:
			"bg-[#e1282a] text-white dark:bg-[#622630] dark:text-[#ffe1e5]",
		lineClass: "bg-[#e1282a] dark:bg-[#cf6675]",
		textClass: "text-[#915a5a] dark:text-[#ee9b9b]",
	},
	unknown: {
		title: "Status Unavailable",
		shortLabel: "Unknown",
		description:
			"We don't have enough recent monitoring data to confirm service health.",
		sectionClass:
			"border-border/70 bg-muted/40 dark:border-border dark:bg-muted/25",
		headerClass: "bg-muted text-foreground",
		lineClass: "bg-muted-foreground/50",
		textClass: "text-muted-foreground",
	},
} as const satisfies Record<OverallStatus, unknown>;

function pluralize(count: number, singular: string, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

export function StatusHeader({
	activeIncidentCount,
	description,
	status,
}: {
	activeIncidentCount: number;
	description?: string;
	status: OverallStatus;
}) {
	const config = STATUS_CONFIG[status];
	const message =
		activeIncidentCount > 0
			? `${pluralize(activeIncidentCount, "active incident")} currently need${activeIncidentCount === 1 ? "s" : ""} attention.`
			: description?.trim() || config.description;

	return (
		<div
			className={cn("overflow-hidden rounded-xl border", config.sectionClass)}
			data-slot="status-section"
		>
			<div
				className={cn(
					"relative z-[1] flex w-full select-none items-start gap-2 overflow-hidden rounded-t-xl rounded-b-none p-3 sm:p-4",
					config.headerClass
				)}
			>
				<div className="shrink-0 p-1">
					<CaretDownIcon className="size-3" />
				</div>
				<div className="flex min-w-0 flex-1 items-baseline gap-3">
					<span className="min-w-0 flex-1 truncate font-semibold text-sm leading-[1.2] sm:text-base">
						{config.title}
					</span>
					<span className="shrink-0 pr-1 font-medium text-xs leading-[1.2] opacity-85 sm:text-sm">
						{config.shortLabel}
					</span>
				</div>
			</div>

			<div className="flex gap-3 px-4 py-3 sm:py-5 sm:pl-[25px]">
				<div className="flex shrink-0 items-stretch">
					<div className={cn("w-0.5 rounded-full", config.lineClass)} />
				</div>
				<div
					className={cn(
						"py-1 font-medium text-sm leading-[1.2] sm:text-base",
						config.textClass
					)}
				>
					{message}
				</div>
			</div>
		</div>
	);
}

const INCIDENT_STATUS_CONFIG: Record<
	string,
	{ label: string; Icon: typeof CheckCircleIcon }
> = {
	investigating: { label: "Investigating", Icon: BoltLightningIcon },
	identified: { label: "Identified", Icon: CircleInfoIcon },
	monitoring: { label: "Monitoring", Icon: ClockRotateIcon },
	resolved: { label: "Resolved", Icon: CheckCircleIcon },
};

const INCIDENT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});

const FOOTER_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	minute: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});

function formatIncidentDate(iso: string): string {
	return INCIDENT_DATE_FORMATTER.format(new Date(iso));
}

export function StatusIncidentList({ incidents }: { incidents: Incident[] }) {
	const active = incidents.filter((i) => i.status !== "resolved");
	const resolved = incidents.filter((i) => i.status === "resolved");

	if (active.length === 0 && resolved.length === 0) {
		return null;
	}

	return (
		<div className="space-y-6">
			{active.length > 0 && (
				<div className="space-y-4">
					<h2 className="font-semibold text-[15px]">Active Incidents</h2>
					{active.map((incident) => (
						<IncidentCard incident={incident} key={incident.id} />
					))}
				</div>
			)}
			{resolved.length > 0 && (
				<div className="space-y-4">
					<h2 className="font-semibold text-[15px]">Past Incidents</h2>
					{resolved.map((incident) => (
						<IncidentCard incident={incident} key={incident.id} />
					))}
				</div>
			)}
		</div>
	);
}

function incidentDotColor(
	incident: Incident
): "success" | "warning" | "destructive" | "muted" {
	if (incident.status === "resolved") {
		return "success";
	}
	if (incident.severity === "critical") {
		return "destructive";
	}
	if (incident.severity === "major") {
		return "warning";
	}
	return "muted";
}

function IncidentCard({ incident }: { incident: Incident }) {
	return (
		<div className="space-y-3">
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<StatusDot color={incidentDotColor(incident)} size="md" />
						<span className="font-medium text-[14px]">{incident.title}</span>
					</div>
					<div className="ml-6 space-y-1">
						<span className="text-muted-foreground text-xs">
							{formatIncidentDate(incident.createdAt)}
							{incident.resolvedAt &&
								` · Resolved ${formatIncidentDate(incident.resolvedAt)}`}
						</span>
						{incident.affectedMonitors.length > 0 && (
							<div className="flex flex-wrap gap-1.5">
								{incident.affectedMonitors.map((am) => (
									<Badge
										key={am.statusPageMonitorId}
										size="sm"
										variant={am.impact === "down" ? "destructive" : "warning"}
									>
										{am.monitorName} ·{" "}
										{am.impact === "down" ? "Down" : "Degraded"}
									</Badge>
								))}
							</div>
						)}
					</div>
				</div>
				<Badge
					size="sm"
					variant={incident.status === "resolved" ? "success" : "warning"}
				>
					{INCIDENT_STATUS_CONFIG[incident.status]?.label ?? incident.status}
				</Badge>
			</div>

			{incident.updates.length > 0 && (
				<div className="ml-6 space-y-3 border-border/50 border-l-2 pl-4">
					{incident.updates.map((update) => {
						const statusConfig = INCIDENT_STATUS_CONFIG[update.status];
						const UpdateIcon = statusConfig?.Icon ?? CircleInfoIcon;
						return (
							<div className="space-y-0.5" key={update.id}>
								<div className="flex items-center gap-1.5">
									<UpdateIcon className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="font-medium text-xs">
										{statusConfig?.label ?? update.status}
									</span>
									<span className="text-muted-foreground/60 text-xs">
										{formatIncidentDate(update.createdAt)}
									</span>
								</div>
								<p className="ml-5 text-[13px] text-muted-foreground leading-relaxed">
									{update.message}
								</p>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

export function StatusFooter({
	activeIncidentCount,
	hasIncidents,
	timestamp,
}: {
	activeIncidentCount: number;
	hasIncidents: boolean;
	timestamp: string | null;
}) {
	let summary = "No incidents in the last 90 days";
	if (activeIncidentCount > 0) {
		summary = pluralize(activeIncidentCount, "active incident");
	} else if (hasIncidents) {
		summary = "No active incidents";
	}

	return (
		<div className="flex items-center justify-between text-muted-foreground/60 text-xs">
			<span>{summary}</span>
			{timestamp && (
				<span className="tabular-nums">
					Updated {FOOTER_TIME_FORMATTER.format(new Date(timestamp))}
				</span>
			)}
		</div>
	);
}
