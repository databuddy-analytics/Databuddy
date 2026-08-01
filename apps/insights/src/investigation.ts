import { createHash } from "node:crypto";
import { investigationSignalSchema } from "@databuddy/shared/insights";
import type {
	InsightMetric,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import type { DetectedSignal, MeasurementCandidate } from "./detection";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

interface InvestigationInput {
	evidence: string[];
	measurementCandidate?: MeasurementCandidate;
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

export function signalKeyForDetectedSignal(
	signal: Pick<DetectedSignal, "metric" | "subjectKey">
): string {
	return boundedKey(signal.subjectKey ?? signal.metric);
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
const ZERO_COMPLETION_SUBJECT_SUFFIX = ":zero-completions";

function isPersistentZeroCompletionSignal(signal: DetectedSignal): boolean {
	return (
		signal.current === 0 &&
		(signal.metric.startsWith("goal:") ||
			signal.metric.startsWith("funnel:")) &&
		signal.subjectKey?.endsWith(ZERO_COMPLETION_SUBJECT_SUFFIX) === true
	);
}

export function isDirectSignal(signal: DetectedSignal): boolean {
	return (
		signal.metric === "revenue" ||
		signal.metric === "error_count" ||
		signal.metric === "custom_event_count" ||
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

function entity(signal: DetectedSignal): InvestigationSignal["entity"] {
	const [prefix, ...idParts] = (signal.subjectKey ?? signal.metric).split(":");
	const exactId = idParts.join(":");
	const rawId = exactId.trim();
	const id = boundedKey(rawId);
	if (prefix === "funnel" && idParts.at(1) === "step") {
		return {
			type: "funnel_step",
			id,
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
		};
	}
	if (prefix === "funnel" || prefix === "goal") {
		return {
			type: prefix,
			// State-qualified conversion signals remain distinct investigations, but
			// their entity must stay the configured definition so goal actions and
			// funnel links continue to resolve the real ID.
			id: boundedKey(idParts[0]?.trim() || rawId),
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
		};
	}
	if (prefix === "custom_event") {
		return {
			id: signal.entityId ?? rawId,
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
			type: "event",
		};
	}
	if (prefix === "route") {
		return {
			type: "page",
			id: signal.entityId ?? rawId,
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
		};
	}
	if (signal.metric === "error_count") {
		return {
			type: "error",
			id: (signal.entityId ?? exactId) || signal.metric,
			label: (signal.entityLabel ?? signal.label).slice(0, 120),
		};
	}
	if (signal.metric === "lcp" || signal.metric === "inp") {
		return { type: "vital", id: signal.metric, label: signal.label };
	}
	return { type: "website", id: "website", label: signal.label.slice(0, 120) };
}

function evidenceSummary(value: string): string {
	return value.length <= 500 ? value : `${value.slice(0, 499).trimEnd()}…`;
}

export function prepareInvestigation(
	candidate: DetectedSignal,
	lookbackDays: number,
	annotations: InvestigationAnnotation[] = []
): InvestigationInput {
	const subject = entity(candidate);
	const window = signalWindow(candidate, lookbackDays);
	const sentiment = isPersistentZeroCompletionSignal(candidate)
		? "negative"
		: candidate.current === candidate.baseline
			? "neutral"
			: isRegression(candidate)
				? "negative"
				: "positive";
	const signal: InvestigationSignal = {
		signalKey: signalKeyForDetectedSignal(candidate),
		entity: subject,
		metric: {
			label: candidate.label,
			current: candidate.current,
			previous: candidate.baseline,
			format: metricFormat(candidate.metric),
		},
		changePercent: candidate.deltaPercent,
		severity: candidate.severity,
		sentiment,
		period: {
			current: { from: window.currentFrom, to: window.currentTo },
			previous: { from: window.previousFrom, to: window.previousTo },
		},
		...(candidate.method === "zscore"
			? { baselineDates: candidate.baselineDates }
			: {}),
	};
	const evidence: string[] = [];
	if (candidate.definitionEvidence) {
		evidence.push(evidenceSummary(candidate.definitionEvidence));
	}
	if (annotations.length > 0) {
		evidence.push(
			evidenceSummary(
				`Annotation: ${annotations
					.map((annotation) => `${annotation.date}: ${annotation.title}`)
					.join("; ")}`
			)
		);
	}

	return {
		evidence,
		...(candidate.measurementCandidate
			? { measurementCandidate: candidate.measurementCandidate }
			: {}),
		signal: investigationSignalSchema.parse(signal),
	};
}
