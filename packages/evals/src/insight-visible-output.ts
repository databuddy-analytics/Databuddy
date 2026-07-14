import type { GeneratedInsight } from "@databuddy/shared/insights";

const WORD_PATTERN = /\S+/g;

export function visibleTextWordCount(value: string): number {
	return value.match(WORD_PATTERN)?.length ?? 0;
}

export function visibleInsightText(insight: GeneratedInsight): string[] {
	return [
		insight.title,
		insight.description,
		insight.impactSummary,
		insight.rootCause,
		...(insight.evidence ?? []).map((item) => item.description),
		insight.suggestion,
		...insight.metrics.map((metric) => metric.label),
	].filter((value): value is string => Boolean(value));
}

export function visibleInsightWordCount(insight: GeneratedInsight): number {
	return visibleInsightText(insight).reduce(
		(count, value) => count + visibleTextWordCount(value),
		0
	);
}
