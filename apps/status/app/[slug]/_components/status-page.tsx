import type { ReactNode } from "react";
import type { AppRouter } from "@databuddy/rpc";
import type { OverallStatus } from "@databuddy/shared/uptime-status";
import type { RouterClient } from "@orpc/server";
import { cn, StatusDot } from "@databuddy/ui";
import { CaretDownIcon } from "@databuddy/ui/icons";
import { MonitorCardInteractive } from "./monitor-card-interactive";

type StatusPageData = NonNullable<
	Awaited<ReturnType<RouterClient<AppRouter>["statusPage"]["getBySlug"]>>
>;
type Incident = StatusPageData["incidents"][number];

function StatusRoot({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("space-y-12", className)} data-slot="status-page">
			{children}
		</div>
	);
}

const STATUS_CONFIG = {
	operational: {
		title: "We're Fully Operational",
		shortLabel: "Operational",
		description: "We're not aware of any issues affecting these services.",
		sectionClass:
			"border-[color-mix(in_oklab,var(--uptime-operational)_30%,transparent)] bg-[color-mix(in_oklab,var(--uptime-operational)_7%,var(--card))]",
		headerClass: "bg-(--uptime-operational) text-white",
		lineClass: "bg-(--uptime-operational)",
	},
	degraded: {
		title: "Some Systems Degraded",
		shortLabel: "Degraded",
		description:
			"One or more services are degraded. We're tracking the impact.",
		sectionClass:
			"border-[color-mix(in_oklab,var(--uptime-degraded)_30%,transparent)] bg-[color-mix(in_oklab,var(--uptime-degraded)_8%,var(--card))]",
		headerClass: "bg-(--uptime-degraded) text-[#2b2000]",
		lineClass: "bg-(--uptime-degraded)",
	},
	outage: {
		title: "Service Disruption",
		shortLabel: "Outage",
		description: "An outage is affecting one or more services.",
		sectionClass:
			"border-[color-mix(in_oklab,var(--uptime-major)_30%,transparent)] bg-[color-mix(in_oklab,var(--uptime-major)_7%,var(--card))]",
		headerClass: "bg-(--uptime-major) text-white",
		lineClass: "bg-(--uptime-major)",
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
	},
} as const satisfies Record<OverallStatus, unknown>;

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit",
	timeZone: "UTC",
	timeZoneName: "short",
});

function formatDateTime(iso: string): string {
	return DATE_TIME_FORMATTER.format(new Date(iso));
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
	return `${count} ${count === 1 ? singular : plural}`;
}

interface StatusHeaderProps {
	activeIncidentCount: number;
	className?: string;
	description?: string;
	status: OverallStatus;
	updatedAt: string | null;
}

function StatusHeader({
	activeIncidentCount,
	className,
	description,
	status,
	updatedAt,
}: StatusHeaderProps) {
	const config = STATUS_CONFIG[status];
	const message =
		activeIncidentCount > 0
			? `${pluralize(activeIncidentCount, "active incident")} currently need${activeIncidentCount === 1 ? "s" : ""} attention.`
			: description?.trim() || config.description;

	return (
		<div className={className} data-slot="status-header">
			<div
				className={cn("overflow-hidden rounded-xl border", config.sectionClass)}
				data-slot="status-section"
			>
				<div
					className={cn(
						"flex w-full select-none items-start gap-2 p-3 sm:p-4",
						config.headerClass
					)}
				>
					<div className="shrink-0 p-1">
						<CaretDownIcon className="size-3" />
					</div>
					<div className="flex min-w-0 flex-1 items-baseline gap-3">
						<h1 className="min-w-0 flex-1 truncate font-semibold text-sm leading-[1.2] sm:text-base">
							{config.title}
						</h1>
						<span className="shrink-0 pr-1 font-medium text-xs leading-[1.2] opacity-85 sm:text-sm">
							{config.shortLabel}
						</span>
					</div>
				</div>

				<div className="flex gap-3 px-4 py-3 sm:py-5 sm:pl-[25px]">
					<div className="flex shrink-0 items-stretch">
						<div className={cn("w-0.5 rounded-full", config.lineClass)} />
					</div>
					<div className="space-y-1.5 py-1">
						<p className="font-medium text-foreground/80 text-sm leading-[1.2] sm:text-base">
							{message}
						</p>
						{updatedAt ? (
							<p className="text-muted-foreground text-xs tabular-nums">
								Updated {formatDateTime(updatedAt)}
							</p>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}

function StatusMonitorList({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="status-monitors"
		>
			{children}
		</div>
	);
}

const INCIDENT_STATUS_LABELS: Record<string, string> = {
	investigating: "Investigating",
	identified: "Identified",
	monitoring: "Monitoring",
	resolved: "Resolved",
};

function incidentStatusLabel(status: string): string {
	return INCIDENT_STATUS_LABELS[status] ?? status;
}

function incidentDotColor(
	incident: Incident
): "success" | "warning" | "destructive" {
	if (incident.status === "resolved") {
		return "success";
	}
	return incident.severity === "critical" ? "destructive" : "warning";
}

function affectedSummary(incident: Incident): string | null {
	if (incident.affectedMonitors.length === 0) {
		return null;
	}
	const names = incident.affectedMonitors.map(
		(am) => `${am.monitorName} (${am.impact === "down" ? "down" : "degraded"})`
	);
	return `Affects ${names.join(", ")}`;
}

function IncidentItem({ incident }: { incident: Incident }) {
	const affected = affectedSummary(incident);
	const timing = incident.resolvedAt
		? `${formatDateTime(incident.createdAt)} to ${formatDateTime(incident.resolvedAt)}`
		: `Since ${formatDateTime(incident.createdAt)}`;

	return (
		<article className="space-y-4">
			<div>
				<div className="flex items-center gap-2">
					<StatusDot color={incidentDotColor(incident)} size="md" />
					<h3 className="min-w-0 font-medium text-[15px] leading-snug">
						{incident.title}
					</h3>
				</div>
				<p className="mt-1 pl-4 text-muted-foreground text-xs tabular-nums leading-relaxed">
					{incidentStatusLabel(incident.status)} · {timing}
					{affected ? ` · ${affected}` : null}
				</p>
			</div>

			{incident.updates.length > 0 ? (
				<ol className="ml-[3px] space-y-4 border-border border-l pl-3">
					{incident.updates.map((update) => (
						<li key={update.id}>
							<p className="text-pretty text-sm leading-relaxed">
								<span className="font-medium">
									{incidentStatusLabel(update.status)}
								</span>
								<span className="text-muted-foreground">
									{" "}
									· {update.message}
								</span>
							</p>
							<time
								className="mt-0.5 block text-muted-foreground/70 text-xs tabular-nums"
								dateTime={update.createdAt}
							>
								{formatDateTime(update.createdAt)}
							</time>
						</li>
					))}
				</ol>
			) : null}
		</article>
	);
}

function StatusActiveIncidents({
	className,
	incidents,
}: {
	className?: string;
	incidents: Incident[];
}) {
	const active = incidents.filter((i) => i.status !== "resolved");

	if (active.length === 0) {
		return null;
	}

	return (
		<section className={cn("space-y-4", className)}>
			<h2 className="font-semibold text-[15px]">Active Incidents</h2>
			<div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
				{active.map((incident) => (
					<div className="p-5" key={incident.id}>
						<IncidentItem incident={incident} />
					</div>
				))}
			</div>
		</section>
	);
}

function StatusPastIncidents({
	className,
	incidents,
}: {
	className?: string;
	incidents: Incident[];
}) {
	const resolved = incidents.filter((i) => i.status === "resolved");

	return (
		<section className={cn("space-y-4", className)}>
			<h2 className="font-semibold text-[15px]">Past Incidents</h2>
			{resolved.length > 0 ? (
				<div className="space-y-8 border-border/70 border-t pt-6">
					{resolved.map((incident) => (
						<IncidentItem incident={incident} key={incident.id} />
					))}
				</div>
			) : (
				<p className="border-border/70 border-t pt-4 text-muted-foreground text-sm">
					No incidents reported in the last 90 days.
				</p>
			)}
		</section>
	);
}

StatusRoot.displayName = "Status";

export const Status: typeof StatusRoot & {
	ActiveIncidents: typeof StatusActiveIncidents;
	Header: typeof StatusHeader;
	MonitorCard: typeof MonitorCardInteractive;
	MonitorList: typeof StatusMonitorList;
	PastIncidents: typeof StatusPastIncidents;
} = Object.assign(StatusRoot, {
	ActiveIncidents: StatusActiveIncidents,
	Header: StatusHeader,
	MonitorCard: MonitorCardInteractive,
	MonitorList: StatusMonitorList,
	PastIncidents: StatusPastIncidents,
});
