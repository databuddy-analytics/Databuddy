import { and, db, desc, eq, gte } from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import dayjs from "dayjs";
import type { ParsedInsight } from "../schemas/smart-insights-output";

const GENERATION_COOLDOWN_HOURS = 6;

export interface InsightDedupeInput {
	changePercent: number | null | undefined;
	sentiment: ParsedInsight["sentiment"];
	subjectKey?: string | null;
	title?: string | null;
	type: ParsedInsight["type"];
	websiteId: string;
}

function normalizeSubjectKey(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replaceAll(/[^a-z0-9]+/g, "_")
		.replaceAll(/^_+|_+$/g, "")
		.slice(0, 80);
}

export function deriveInsightSubjectKey(input: {
	subjectKey?: string | null;
	title?: string | null;
	type: ParsedInsight["type"];
}): string {
	if (input.subjectKey) {
		const normalized = normalizeSubjectKey(input.subjectKey);
		if (normalized) {
			return normalized;
		}
	}

	if (input.title) {
		const normalized = normalizeSubjectKey(input.title);
		if (normalized) {
			return normalized;
		}
	}

	return input.type;
}

function directionKeyFromParts(
	changePercent: number | null | undefined,
	sentiment: ParsedInsight["sentiment"]
): "down" | "flat" | "up" {
	if (
		changePercent !== null &&
		changePercent !== undefined &&
		changePercent !== 0
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

export function insightDedupeKey(input: InsightDedupeInput): string {
	const dir = directionKeyFromParts(input.changePercent, input.sentiment);
	const subjectKey = deriveInsightSubjectKey(input);
	return `${input.websiteId}|${input.type}|${dir}|${subjectKey}`;
}

export async function fetchInsightDedupeKeyToIdMap(
	organizationId: string
): Promise<Map<string, string>> {
	const cutoff = dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate();
	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
			subjectKey: analyticsInsights.subjectKey,
			title: analyticsInsights.title,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				gte(analyticsInsights.createdAt, cutoff)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt));

	const map = new Map<string, string>();
	for (const row of rows) {
		const key = insightDedupeKey({
			websiteId: row.websiteId,
			type: row.type as ParsedInsight["type"],
			sentiment: row.sentiment as ParsedInsight["sentiment"],
			changePercent: row.changePercent,
			subjectKey: row.subjectKey,
			title: row.title,
		});
		if (!map.has(key)) {
			map.set(key, row.id);
		}
	}
	return map;
}
