import { createHash } from "node:crypto";
import {
	investigationEvidenceSchema,
	investigationSignalSchema,
} from "@databuddy/shared/insights";
import type {
	InsightMetric,
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import type { DetectedSignal } from "./detection";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

export interface InvestigationInput {
	evidence: InvestigationEvidence[];
	signal: InvestigationSignal;
}

export interface InvestigationAnnotation {
	date: string;
	title: string;
}

export function signalAnnotationWindow(
	signal: InvestigationSignal,
	timezone: string
): { from: Date; to: Date } {
	return {
		from: dayjs
			.tz(signal.period.current.from, timezone)
			.startOf("day")
			.toDate(),
		to: dayjs.tz(signal.period.current.to, timezone).endOf("day").toDate(),
	};
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function boundedKey(value: string): string {
	if (value.length <= 160) {
		return value;
	}
	return `${value.slice(0, 139)}:${digest(value)}`;
}

function signalKeyForMetric(metric: string): string {
	return boundedKey(metric);
}

export function signalKeyForDetectedSignal(
	signal: Pick<DetectedSignal, "metric">
): string {
	return signalKeyForMetric(signal.metric);
}

function metricFormat(metric: string): InsightMetric["format"] {
	if (
		metric === "bounce_rate" ||
		metric.startsWith("funnel:") ||
		metric.startsWith("goal:")
	) {
		return "percent";
	}
	if (metric === "session_duration") {
		return "duration_s";
	}
	if (metric === "lcp" || metric === "inp") {
		return "duration_ms";
	}
	return "number";
}

function isLowerBetter(metric: string): boolean {
	return ["bounce_rate", "error_count", "lcp", "inp"].includes(metric);
}

const SEVERITY_RANK = { critical: 2, warning: 1, info: 0 } as const;

export function isDirectSignal(signal: DetectedSignal): boolean {
	return (
		signal.metric === "revenue" ||
		signal.metric === "error_count" ||
		signal.metric === "lcp" ||
		signal.metric === "inp" ||
		signal.metric.startsWith("goal:") ||
		signal.metric.startsWith("funnel:")
	);
}

export function isRegression(signal: DetectedSignal): boolean {
	if (signal.metric === "lcp" && signal.current > 2500) {
		return true;
	}
	if (signal.metric === "inp" && signal.current > 200) {
		return true;
	}
	return isLowerBetter(signal.metric)
		? signal.direction === "up"
		: signal.direction === "down";
}

function signalBucket(signal: DetectedSignal): number {
	if (isRegression(signal)) {
		return isDirectSignal(signal) ? 0 : 1;
	}
	return isDirectSignal(signal) ? 2 : 3;
}

export function rankSignals(signals: DetectedSignal[]): DetectedSignal[] {
	return [...signals].sort(
		(a, b) =>
			signalBucket(a) - signalBucket(b) ||
			SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
			Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent) ||
			a.metric.localeCompare(b.metric)
	);
}

function signalWindow(signal: DetectedSignal, lookbackDays: number) {
	const detectedDay = dayjs(signal.detectedAt);
	if (signal.method === "zscore") {
		const baselineDates = signal.baselineDates ?? [];
		return {
			currentFrom: signal.detectedAt,
			currentTo: signal.detectedAt,
			previousFrom:
				baselineDates[0] ??
				detectedDay.subtract(lookbackDays - 1, "day").format("YYYY-MM-DD"),
			previousTo:
				baselineDates.at(-1) ??
				detectedDay.subtract(1, "day").format("YYYY-MM-DD"),
		};
	}
	const days = Math.max(3, lookbackDays);
	return {
		currentFrom: detectedDay.subtract(days - 1, "day").format("YYYY-MM-DD"),
		currentTo: signal.detectedAt,
		previousFrom: detectedDay
			.subtract(days * 2 - 1, "day")
			.format("YYYY-MM-DD"),
		previousTo: detectedDay.subtract(days, "day").format("YYYY-MM-DD"),
	};
}

function insightType(
	signal: DetectedSignal
): InvestigationSignal["insightType"] {
	if (signal.metric === "error_count") {
		return signal.direction === "up" ? "error_spike" : "reliability_improved";
	}
	if (signal.metric === "lcp" || signal.metric === "inp") {
		return isRegression(signal) ? "vitals_degraded" : "performance_improved";
	}
	if (signal.metric === "bounce_rate") {
		return "bounce_rate_change";
	}
	if (signal.metric === "session_duration") {
		return "engagement_change";
	}
	if (signal.metric.startsWith("funnel:")) {
		return signal.direction === "down" ? "funnel_regression" : "positive_trend";
	}
	if (signal.metric.startsWith("goal:")) {
		return signal.direction === "down" ? "conversion_leak" : "positive_trend";
	}
	if (signal.metric.startsWith("custom_event:")) {
		return signal.direction === "up"
			? "custom_event_spike"
			: "engagement_change";
	}
	if (["visitors", "sessions", "pageviews"].includes(signal.metric)) {
		return signal.direction === "up" ? "traffic_spike" : "traffic_drop";
	}
	return signal.direction === "up" ? "positive_trend" : "quality_shift";
}

function entity(signal: DetectedSignal): InvestigationSignal["entity"] {
	const [prefix, ...idParts] = signal.metric.split(":");
	const id = boundedKey(idParts.join(":").trim());
	if (prefix === "funnel" || prefix === "goal") {
		return {
			type: prefix,
			id,
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
		};
	}
	if (prefix === "custom_event") {
		return { type: "event", id, label: signal.label.slice(0, 120) };
	}
	if (signal.metric === "error_count") {
		return { type: "error", id: signal.metric, label: signal.label };
	}
	if (signal.metric === "lcp" || signal.metric === "inp") {
		return { type: "vital", id: signal.metric, label: signal.label };
	}
	return { type: "website", id: "website", label: signal.label.slice(0, 120) };
}

function signalPriority(severity: DetectedSignal["severity"]): number {
	return severity === "critical" ? 9 : severity === "warning" ? 7 : 5;
}

function evidenceSummary(value: string): string {
	return value.length <= 500 ? value : `${value.slice(0, 499).trimEnd()}…`;
}

export function prepareInvestigation(
	candidate: DetectedSignal,
	params: { lookbackDays: number; websiteId: string },
	annotations: InvestigationAnnotation[] = []
): InvestigationInput {
	const subject = entity(candidate);
	const window = signalWindow(candidate, params.lookbackDays);
	const improved = !isRegression(candidate);
	const signal: InvestigationSignal = {
		signalKey: signalKeyForDetectedSignal(candidate),
		websiteId: params.websiteId,
		insightType: insightType(candidate),
		entity: subject,
		metric: {
			key: signalKeyForMetric(candidate.metric),
			label: candidate.label,
			current: candidate.current,
			previous: candidate.baseline,
			format: metricFormat(candidate.metric),
		},
		changePercent: candidate.deltaPercent,
		direction: candidate.direction,
		severity: candidate.severity,
		sentiment: improved ? "positive" : "negative",
		priority: signalPriority(candidate.severity),
		period: {
			current: { from: window.currentFrom, to: window.currentTo },
			previous: { from: window.previousFrom, to: window.previousTo },
		},
		detectedAt: candidate.detectedAt,
		detection: {
			method: candidate.method === "wow" ? "period_comparison" : "zscore",
			reason:
				candidate.method === "zscore"
					? `${candidate.label} was ${candidate.zScore} standard deviations from its comparable-day baseline.`
					: `${candidate.label} changed ${candidate.deltaPercent}% from the previous period.`,
			...(candidate.method === "zscore"
				? { baselineDates: candidate.baselineDates }
				: {}),
			...(candidate.boundary ? { boundary: candidate.boundary } : {}),
		},
	};
	const evidence: InvestigationEvidence[] = [];
	if (candidate.definitionEvidence) {
		evidence.push({
			source: "product",
			summary: candidate.definitionEvidence.summary,
			metrics: candidate.definitionEvidence.metrics,
		});
	}
	if (annotations.length > 0) {
		evidence.push({
			source: "business",
			summary: evidenceSummary(
				annotations
					.map((annotation) => `${annotation.date}: ${annotation.title}`)
					.join("; ")
			),
		});
	}

	return {
		signal: investigationSignalSchema.parse(signal),
		evidence: investigationEvidenceSchema.array().parse(evidence),
	};
}
