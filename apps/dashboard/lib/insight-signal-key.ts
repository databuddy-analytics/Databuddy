import type { Insight, InsightSentiment } from "@/lib/insight-types";
import { insightDedupeKey } from "@databuddy/shared/insights";

/** Uses the same signal key as persistence. */
export function insightSignalDedupeKey(
	insight: Pick<
		Insight,
		| "changePercent"
		| "sentiment"
		| "subjectKey"
		| "title"
		| "type"
		| "websiteId"
	>
): string {
	return insightDedupeKey(insight);
}

function insightSortTimeMs(insight: Insight): number {
	const time = new Date(insight.createdAt).getTime();
	return Number.isNaN(time) ? 0 : time;
}

/** One row per (website, type, direction, subject): keeps the newest version. */
export function collapseInsightsBySignal(insights: Insight[]): Insight[] {
	const sorted = [...insights].sort(
		(a, b) => insightSortTimeMs(b) - insightSortTimeMs(a)
	);
	const byKey = new Map<string, Insight>();
	for (const i of sorted) {
		const key = insightSignalDedupeKey(i);
		if (!byKey.has(key)) {
			byKey.set(key, i);
		}
	}
	return [...byKey.values()].sort(
		(a, b) => insightSortTimeMs(b) - insightSortTimeMs(a)
	);
}

export function formatSignedChangePercent(changePercent: number): string {
	const sign = changePercent > 0 ? "+" : "";
	return `${sign}${changePercent}%`;
}

export function changePercentChipClassName(
	changePercent: number,
	sentiment?: InsightSentiment
): string {
	if (sentiment === "positive") {
		return "text-emerald-600";
	}
	if (sentiment === "negative") {
		return "text-red-500";
	}
	if (changePercent > 0) {
		return "text-emerald-600";
	}
	if (changePercent < 0) {
		return "text-red-500";
	}
	return "text-muted-foreground";
}
