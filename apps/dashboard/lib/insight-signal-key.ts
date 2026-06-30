import type {
	Insight,
	InsightSentiment,
	InsightType,
} from "@/lib/insight-types";

type Direction = "up" | "down" | "flat";

function directionFromParts(
	changePercent: number | undefined,
	sentiment: InsightSentiment
): Direction {
	if (
		changePercent !== undefined &&
		changePercent !== 0 &&
		!Number.isNaN(changePercent)
	) {
		return changePercent > 0 ? "up" : "down";
	}
	if (sentiment === "positive") {
		return "up";
	}
	if (sentiment === "negative") {
		return "down";
	}
	return "flat";
}

/** Matches server `insightDedupeKey` in @databuddy/ai/insights/dedupe. */
export function insightSignalDedupeKey(insight: {
	websiteId: string;
	type: InsightType;
	sentiment: InsightSentiment;
	changePercent?: number;
}): string {
	const dir = directionFromParts(insight.changePercent, insight.sentiment);
	return `${insight.websiteId}|${insight.type}|${dir}`;
}

function insightSortTimeMs(insight: Insight): number {
	if (insight.createdAt) {
		const t = new Date(insight.createdAt).getTime();
		if (!Number.isNaN(t)) {
			return t;
		}
	}
	if (insight.insightSource === "ai") {
		return Date.now();
	}
	return 0;
}

/** One row per (website, type, direction): keeps the newest version for history noise. */
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
