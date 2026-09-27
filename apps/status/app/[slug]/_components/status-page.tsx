import type { AppRouter } from "@databuddy/rpc";
import type { OverallStatus } from "@databuddy/shared/uptime-status";
import type { RouterClient } from "@orpc/server";
import { cn, StatusDot } from "@databuddy/ui";

export type StatusPageData = NonNullable<
	Awaited<ReturnType<RouterClient<AppRouter>["statusPage"]["getBySlug"]>>
>;
export type StatusMonitor = StatusPageData["monitors"][number];
type Incident = StatusPageData["incidents"][number];

const STATUS_CONFIG = {
	operational: {
		title: "We're Fully Operational",
		description: "We're not aware of any issues affecting these services.",
		dotColor: "success",
		ring: "ring-success/15",
	},
	degraded: {
		title: "Some Systems Degraded",
		description:
			"One or more services are degraded. We're tracking the impact.",
		dotColor: "warning",
		ring: "ring-warning/15",
	},
	outage: {
		title: "Service Disruption",
		description: "An outage is affecting one or more services.",
		dotColor: "destructive",
		ring: "ring-destructive/15",
	},
	unknown: {
		title: "Status Unavailable",
		description:
			"We don't have enough recent monitoring data to confirm service health.",
		dotColor: "muted",
		ring: "ring-muted",
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

export function StatusHeader({
	activeIncidentCount,
	description,
	status,
	updatedAt,
}: {
	activeIncidentCount: number;
	description: string | null;
	status: OverallStatus;
	updatedAt: string | null;
}) {
	const config = STATUS_CONFIG[status];
	const message =
		activeIncidentCount > 0
			? `${activeIncidentCount} active incident${activeIncidentCount === 1 ? " currently needs" : "s currently need"} attention.`
			: description?.trim() || config.description;

	return (
		<section
			className="rounded-xl border border-border/60 bg-card p-4 sm:p-5"
			data-slot="status-header"
		>
			<div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
				<div className="min-w-0">
					<div className="flex items-center gap-3">
						<StatusDot
							className={cn("ring-4", config.ring)}
							color={config.dotColor}
							size="lg"
						/>
						<h1 className="min-w-0 font-semibold text-base leading-tight sm:text-lg">
							{config.title}
						</h1>
					</div>
					<p className="mt-1.5 pl-[22px] text-muted-foreground text-sm leading-relaxed">
						{message}
					</p>
				</div>
				{updatedAt ? (
					<span className="shrink-0 pl-[22px] text-muted-foreground text-xs tabular-nums sm:pt-1 sm:pl-0">
						Updated {formatDateTime(updatedAt)}
					</span>
				) : null}
			</div>
		</section>
	);
}

const INCIDENT_STATUS_LABELS: Record<Incident["status"], string> = {
	investigating: "Investigating",
	identified: "Identified",
	monitoring: "Monitoring",
	resolved: "Resolved",
};

function incidentDotColor(
	incident: Incident
): "success" | "warning" | "destructive" {
	if (incident.status === "resolved") {
		return "success";
	}
	return incident.severity === "critical" ? "destructive" : "warning";
}

function IncidentItem({ incident }: { incident: Incident }) {
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
					{INCIDENT_STATUS_LABELS[incident.status]} · {timing}
					{incident.affectedMonitors.length > 0
						? ` · Affects ${incident.affectedMonitors.map((am) => `${am.monitorName} (${am.impact})`).join(", ")}`
						: null}
				</p>
			</div>

			{incident.updates.length > 0 ? (
				<ol className="ml-[3px] space-y-4 border-border border-l pl-3">
					{incident.updates.map((update) => (
						<li key={update.id}>
							<p className="text-pretty text-sm leading-relaxed">
								<span className="font-medium">
									{INCIDENT_STATUS_LABELS[update.status]}
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

export function ActiveIncidents({ incidents }: { incidents: Incident[] }) {
	if (incidents.length === 0) {
		return null;
	}

	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-[15px]">Active Incidents</h2>
			<div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-card">
				{incidents.map((incident) => (
					<div className="p-5" key={incident.id}>
						<IncidentItem incident={incident} />
					</div>
				))}
			</div>
		</section>
	);
}

export function PastIncidents({ incidents }: { incidents: Incident[] }) {
	return (
		<section className="space-y-4">
			<h2 className="font-semibold text-[15px]">Past Incidents</h2>
			{incidents.length > 0 ? (
				<div className="space-y-8 border-border/70 border-t pt-6">
					{incidents.map((incident) => (
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
