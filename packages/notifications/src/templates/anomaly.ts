import type { NotificationPayload, NotificationPriority } from "../types";

export type AnomalyNotificationKind = "spike" | "drop";

export interface AnomalyNotificationInput {
	baselineValue: number;
	currentValue: number;
	dashboardUrl?: string;
	eventName?: string;
	kind: AnomalyNotificationKind;
	metric: string;
	percentChange: number;
	periodEnd: string;
	periodStart: string;
	severity: "warning" | "critical";
	siteLabel: string;
	zScore: number;
}

function priorityForSeverity(
	severity: "warning" | "critical"
): NotificationPriority {
	if (severity === "critical") {
		return "urgent";
	}
	return "high";
}

function formatMetric(metric: string, eventName?: string): string {
	if (eventName) {
		return `${eventName} (custom event)`;
	}
	const labels: Record<string, string> = {
		pageviews: "Pageviews",
		errors: "Errors",
		custom_events: "Custom Events",
	};
	return labels[metric] ?? metric;
}

function formatNumber(value: number): string {
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

function buildTitle(input: AnomalyNotificationInput): string {
	const icon = input.kind === "spike" ? "↑" : "↓";
	const label = input.severity === "critical" ? "Critical" : "Warning";
	const metricLabel = formatMetric(input.metric, input.eventName);

	return `${icon} ${label}: ${metricLabel} ${input.kind} on ${input.siteLabel}`;
}

function buildMessage(input: AnomalyNotificationInput): string {
	const metricLabel = formatMetric(input.metric, input.eventName);
	const direction = input.kind === "spike" ? "above" : "below";
	const changeDir = input.kind === "spike" ? "+" : "";

	const lines: string[] = [
		`${metricLabel} is ${Math.abs(input.percentChange).toFixed(1)}% ${direction} the expected baseline.`,
		"",
		`Current: ${formatNumber(input.currentValue)}`,
		`Baseline: ${formatNumber(input.baselineValue)}`,
		`Change: ${changeDir}${input.percentChange.toFixed(1)}%`,
		`Z-Score: ${input.zScore.toFixed(2)}`,
		`Period: ${input.periodStart} – ${input.periodEnd}`,
	];

	if (input.dashboardUrl) {
		lines.push("", `View details: ${input.dashboardUrl}`);
	}

	return lines.join("\n");
}

export function buildAnomalyNotificationPayload(
	input: AnomalyNotificationInput
): NotificationPayload {
	const metadata: Record<string, unknown> = {
		template: "anomaly",
		kind: input.kind,
		metric: input.metric,
		siteLabel: input.siteLabel,
		severity: input.severity,
		currentValue: input.currentValue,
		baselineValue: input.baselineValue,
		percentChange: input.percentChange,
		zScore: input.zScore,
		periodStart: input.periodStart,
		periodEnd: input.periodEnd,
	};

	if (input.eventName) {
		metadata.eventName = input.eventName;
	}
	if (input.dashboardUrl) {
		metadata.dashboardUrl = input.dashboardUrl;
	}

	return {
		title: buildTitle(input),
		message: buildMessage(input),
		priority: priorityForSeverity(input.severity),
		metadata,
	};
}
