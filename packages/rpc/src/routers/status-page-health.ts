import type { UptimeGranularity } from "@databuddy/shared/uptime";

export type MonitorStatus = "up" | "down" | "degraded" | "unknown";
export type MonitorFreshness = "fresh" | "stale" | "unknown";
export type OverallStatus = "operational" | "degraded" | "outage" | "unknown";

const GRANULARITY_MS = {
	minute: 60_000,
	five_minutes: 5 * 60_000,
	ten_minutes: 10 * 60_000,
	thirty_minutes: 30 * 60_000,
	hour: 60 * 60_000,
	six_hours: 6 * 60 * 60_000,
	twelve_hours: 12 * 60 * 60_000,
	day: 24 * 60 * 60_000,
} satisfies Record<UptimeGranularity, number>;

function parseCheckTimestamp(value: string): number {
	const normalized = value.includes("T")
		? value
		: `${value.replace(" ", "T")}Z`;
	return Date.parse(normalized);
}

export function normalizeCheckTimestamp(value: string | null): string | null {
	if (!value) {
		return null;
	}
	const timestamp = parseCheckTimestamp(value);
	return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function deriveMonitorFreshness(
	lastCheckedAt: string | null,
	granularity: UptimeGranularity | null,
	now = Date.now()
): MonitorFreshness {
	if (!(lastCheckedAt && granularity)) {
		return "unknown";
	}

	const checkedAt = parseCheckTimestamp(lastCheckedAt);
	const interval = GRANULARITY_MS[granularity];
	if (!(Number.isFinite(checkedAt) && interval)) {
		return "unknown";
	}

	const staleAfter = Math.max(interval * 3, 5 * 60_000);
	return now - checkedAt <= staleAfter ? "fresh" : "stale";
}

export function deriveMonitorStatus({
	lastStatus,
	lastHttpCode,
	freshness,
}: {
	lastStatus: number | null;
	lastHttpCode: number | null;
	freshness: MonitorFreshness;
}): MonitorStatus {
	if (freshness !== "fresh") {
		return "unknown";
	}
	if (lastStatus === 1) {
		return "up";
	}
	if (lastStatus !== 0) {
		return "unknown";
	}
	if (lastHttpCode != null && lastHttpCode > 0 && lastHttpCode < 500) {
		return "degraded";
	}
	return "down";
}

export function deriveOverallStatus(
	monitors: Array<{
		currentStatus: MonitorStatus;
		freshness: MonitorFreshness;
	}>,
	incidents: Array<{
		status: string;
		severity: string;
		affectedMonitors: { impact: string }[];
	}> = []
): OverallStatus {
	const activeIncidents = incidents.filter(
		(incident) => incident.status !== "resolved"
	);

	if (activeIncidents.some((incident) => incident.severity === "critical")) {
		return "outage";
	}
	if (
		activeIncidents.some((incident) =>
			incident.affectedMonitors.some((monitor) => monitor.impact === "down")
		)
	) {
		return "outage";
	}
	if (activeIncidents.length > 0) {
		return "degraded";
	}

	if (monitors.length === 0) {
		return "unknown";
	}

	const down = monitors.filter(
		(monitor) => monitor.currentStatus === "down"
	).length;
	if (down === monitors.length) {
		return "outage";
	}
	if (down > 0) {
		return "degraded";
	}
	if (monitors.some((monitor) => monitor.currentStatus === "degraded")) {
		return "degraded";
	}
	if (
		monitors.some(
			(monitor) =>
				monitor.currentStatus === "unknown" || monitor.freshness !== "fresh"
		)
	) {
		return "unknown";
	}
	return "operational";
}
