import type { ReactNode } from "react";
import type { AppRouter } from "@databuddy/rpc";
import type { OverallStatus } from "@databuddy/shared/uptime-status";
import type { RouterClient } from "@orpc/server";
import { cn, StatusDot } from "@databuddy/ui";
import {
	CheckIcon,
	MinusIcon,
	QuestionIcon,
	XMarkIcon,
} from "@databuddy/ui/icons";
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
		<div className={cn("space-y-14", className)} data-slot="status-page">
			{children}
		</div>
	);
}

const STATUS_CONFIG = {
	operational: {
		title: "All systems operational",
		description: "We're not aware of any issues affecting these services.",
		Icon: CheckIcon,
		iconClass: "bg-success ring-success/15",
	},
	degraded: {
		title: "Some systems degraded",
		description:
			"One or more services are degraded. We're tracking the impact.",
		Icon: MinusIcon,
		iconClass: "bg-warning ring-warning/15",
	},
	outage: {
		title: "Service disruption",
		description: "An outage is affecting one or more services.",
		Icon: XMarkIcon,
		iconClass: "bg-destructive ring-destructive/15",
	},
	unknown: {
		title: "Status unavailable",
		description:
			"We don't have enough recent monitoring data to confirm service health.",
		Icon: QuestionIcon,
		iconClass: "bg-muted-foreground ring-muted-foreground/15",
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
			? `${pluralize(activeIncidentCount, "active incident")} being tracked below.`
			: description?.trim() || config.description;

	return (
		<header
			className={cn("flex items-start gap-4", className)}
			data-slot="status-header"
		>
			<span
				className={cn(
					"mt-1 ml-[5px] flex size-8 shrink-0 items-center justify-center rounded-full text-white ring-[5px]",
					config.iconClass
				)}
			>
				<config.Icon className="size-4" />
			</span>
			<div className="min-w-0">
				<h1 className="text-balance font-semibold text-2xl leading-tight tracking-tight">
					{config.title}
				</h1>
				<p className="mt-1.5 text-pretty text-muted-foreground text-sm leading-relaxed">
					{message}
				</p>
				{updatedAt ? (
					<p className="mt-1 text-muted-foreground/70 text-xs tabular-nums">
						Updated {formatDateTime(updatedAt)}
					</p>
				) : null}
			</div>
		</header>
	);
}

function StatusMonitorList({
	children,
	className,
	days,
}: {
	children: ReactNode;
	className?: string;
	days: number;
}) {
	return (
		<section className={className} data-slot="status-monitors">
			<div className="mb-3 flex items-baseline justify-between gap-4">
				<h2 className="font-medium text-sm">Services</h2>
				<span className="text-muted-foreground text-xs">
					Uptime over the past {days} days
				</span>
			</div>
			<div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
				{children}
			</div>
		</section>
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
		<section className={cn("space-y-3", className)}>
			<h2 className="font-medium text-sm">Active incidents</h2>
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
		<section className={cn("space-y-3", className)}>
			<h2 className="font-medium text-sm">Past incidents</h2>
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
