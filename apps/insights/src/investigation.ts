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
import type { EnrichedSignal, SegmentBreakdown } from "./enrichment";
import { signalWindow } from "./enrichment";

export interface InvestigationInput {
	evidence: InvestigationEvidence[];
	signals: InvestigationSignal[];
}

function digest(value: string): string {
	return createHash("sha256").update(value).digest("hex").slice(0, 20);
}

function stableKey(prefix: string, value: string): string {
	return `${prefix}:${digest(value)}`;
}

function boundedKey(value: string): string {
	if (value.length <= 160) {
		return value;
	}
	return `${value.slice(0, 139)}:${digest(value)}`;
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

function insightType(
	signal: EnrichedSignal
): InvestigationSignal["insightType"] {
	if (signal.metric === "error_count") {
		return signal.direction === "up" ? "error_spike" : "reliability_improved";
	}
	if (signal.metric === "lcp" || signal.metric === "inp") {
		return signal.direction === "up"
			? "vitals_degraded"
			: "performance_improved";
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

function entity(signal: EnrichedSignal): InvestigationSignal["entity"] {
	const [prefix, ...idParts] = signal.metric.split(":");
	const id = boundedKey(idParts.join(":").trim());
	if (prefix === "funnel" || prefix === "goal") {
		return { type: prefix, id, label: signal.label.slice(0, 120) };
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

function sourceForMetric(metric: string): InvestigationEvidence["source"] {
	if (metric === "error_count" || metric === "lcp" || metric === "inp") {
		return "ops";
	}
	if (
		metric.startsWith("funnel:") ||
		metric.startsWith("goal:") ||
		metric.startsWith("custom_event:")
	) {
		return "product";
	}
	if (metric === "revenue") {
		return "business";
	}
	return "web";
}

function signalPriority(severity: EnrichedSignal["severity"]): number {
	return severity === "critical" ? 9 : severity === "warning" ? 7 : 5;
}

function evidenceSummary(value: string): string {
	return value.length <= 500 ? value : `${value.slice(0, 499).trimEnd()}…`;
}

function comparisonEvidence(
	signal: InvestigationSignal
): InvestigationEvidence[] {
	const source = sourceForMetric(signal.metric.key);
	return (["current", "previous"] as const).map((period) => {
		const value =
			period === "current"
				? signal.metric.current
				: (signal.metric.previous ?? 0);
		const summary =
			period === "previous" && signal.detection.method === "zscore"
				? `Comparable-day median ${signal.metric.label.toLowerCase()} was ${value} across ${signal.detection.baselineDates?.length ?? 0} days: ${signal.detection.baselineDates?.join(", ") ?? "unknown"}.`
				: `${period === "current" ? "Current" : "Previous"} ${signal.metric.label.toLowerCase()} was ${value}.`;
		return {
			evidenceId: stableKey(
				"evidence",
				`${signal.signalKey}:detector:${period}`
			),
			signalKey: signal.signalKey,
			kind: "trend",
			source,
			queryType: boundedKey(`detector:${signal.metric.key}`),
			period,
			range: signal.period[period],
			status: "ok",
			rowCount: signal.sampleSize?.[period] ?? 1,
			summary: evidenceSummary(summary),
			metrics: [
				{
					label: signal.metric.label,
					current: value,
					format: signal.metric.format,
				},
			],
		} satisfies InvestigationEvidence;
	});
}

function segmentEvidence(
	signal: InvestigationSignal,
	segment: SegmentBreakdown
): InvestigationEvidence {
	const metrics = segment.topMovers.map((mover) => ({
		label: `${segment.dimension}: ${mover.name}`,
		current: mover.current,
		previous: mover.previous,
		format: "number" as const,
	}));
	const summary = segment.topMovers
		.map(
			(mover) =>
				`${mover.name}: ${mover.previous} to ${mover.current} (${mover.deltaPercent > 0 ? "+" : ""}${mover.deltaPercent}%)`
		)
		.join("; ");
	return {
		evidenceId: stableKey(
			"evidence",
			`${signal.signalKey}:segment:${segment.dimension}`
		),
		signalKey: signal.signalKey,
		kind: "breakdown",
		source: "web",
		queryType: `segment:${segment.dimension}`,
		period: "custom",
		comparison: signal.period,
		range: null,
		status: "ok",
		rowCount: segment.topMovers.length,
		summary: evidenceSummary(summary),
		metrics,
	};
}

export function prepareInvestigation(
	enrichedSignals: EnrichedSignal[],
	params: { lookbackDays: number; websiteId: string }
): InvestigationInput {
	const signals = enrichedSignals.map((candidate): InvestigationSignal => {
		const subject = entity(candidate);
		const window = signalWindow(candidate, params.lookbackDays);
		const improved = isLowerBetter(candidate.metric)
			? candidate.direction === "down"
			: candidate.direction === "up";
		return {
			signalKey: boundedKey(candidate.metric),
			websiteId: params.websiteId,
			kind: "change",
			insightType: insightType(candidate),
			entity: subject,
			metric: {
				key: boundedKey(candidate.metric),
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
			...(candidate.method === "zscore"
				? {
						sampleSize: {
							current: 1,
							previous: candidate.baselineDates?.length ?? 0,
						},
					}
				: {}),
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
			},
		};
	});

	const evidence = enrichedSignals.flatMap((candidate, index) => {
		const signal = signals[index];
		const items: InvestigationEvidence[] = [
			...comparisonEvidence(signal),
			...candidate.segments.map((segment) => segmentEvidence(signal, segment)),
		];

		if (candidate.errorContext) {
			const context = candidate.errorContext;
			items.push({
				evidenceId: stableKey("evidence", `${signal.signalKey}:errors`),
				signalKey: signal.signalKey,
				kind: "related_change",
				source: "ops",
				queryType: "error_summary",
				period: "custom",
				comparison: signal.period,
				range: null,
				status: "ok",
				rowCount: 1,
				summary: evidenceSummary(
					`Errors changed from ${context.totalErrorsPrevious} to ${context.totalErrorsCurrent}. New: ${context.topNewErrors.join(", ") || "none"}. Spiking: ${context.topSpikedErrors.join(", ") || "none"}.`
				),
				metrics: [
					{
						label: "Errors",
						current: context.totalErrorsCurrent,
						previous: context.totalErrorsPrevious,
						format: "number",
					},
				],
			});
		}

		if (candidate.vitalsContext) {
			items.push({
				evidenceId: stableKey("evidence", `${signal.signalKey}:vitals`),
				signalKey: signal.signalKey,
				kind: "related_change",
				source: "ops",
				queryType: "vitals_overview",
				period: "custom",
				comparison: signal.period,
				range: null,
				status: "ok",
				rowCount: candidate.vitalsContext.metrics.length,
				summary: evidenceSummary(
					candidate.vitalsContext.metrics
						.map(
							(metric) =>
								`${metric.name}: ${metric.previousP75} to ${metric.currentP75} p75`
						)
						.join("; ")
				),
				metrics: candidate.vitalsContext.metrics.map((metric) => ({
					label: `${metric.name} p75`,
					current: metric.currentP75,
					previous: metric.previousP75,
					format: metric.name === "CLS" ? "number" : "duration_ms",
				})),
			});
		}

		if (candidate.annotations.length > 0) {
			items.push({
				evidenceId: stableKey("evidence", `${signal.signalKey}:annotations`),
				signalKey: signal.signalKey,
				kind: "related_change",
				source: "business",
				queryType: "annotations",
				period: "custom",
				comparison: signal.period,
				range: null,
				status: "ok",
				rowCount: candidate.annotations.length,
				summary: evidenceSummary(
					candidate.annotations
						.map((annotation) => `${annotation.date}: ${annotation.title}`)
						.join("; ")
				),
			});
		}

		return items;
	});

	return {
		signals: investigationSignalSchema.array().parse(signals),
		evidence: investigationEvidenceSchema.array().parse(evidence),
	};
}
