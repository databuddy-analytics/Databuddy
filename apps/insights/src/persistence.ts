import { insightDedupeKey } from "@databuddy/ai/insights/dedupe";
import type {
	InsightMetricRow,
	WeekOverWeekPeriod,
} from "@databuddy/ai/insights/types";
import type { ParsedInsight } from "@databuddy/ai/schemas/smart-insights-output";
import {
	and,
	db,
	desc,
	eq,
	getTableColumns,
	gte,
	inArray,
	isNotNull,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	type InsightGenerationConfigSnapshot,
	insightUserFeedback,
} from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import dayjs from "dayjs";
import { emitInsightsEvent } from "./lib/evlog-insights";

const DEFAULT_MAX_INSIGHTS = 2;
const DISMISSAL_SUPPRESSION_LOOKBACK_DAYS = 30;
const MATERIALLY_WORSE_MULTIPLIER = 1.5;
const SEVERITY_RANK: Record<string, number> = {
	info: 0,
	warning: 1,
	critical: 2,
};

const REFRESHED_INSIGHT_COLUMNS = [
	"title",
	"description",
	"suggestion",
	"severity",
	"sentiment",
	"type",
	"priority",
	"changePercent",
	"subjectKey",
	"sources",
	"confidence",
	"impactSummary",
	"rootCause",
	"evidence",
	"investigationDepth",
	"actions",
	"metrics",
] as const satisfies readonly (keyof typeof analyticsInsights.$inferInsert)[];

export interface GeneratedWebsiteInsight extends ParsedInsight {
	id: string;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export function maxInsights(config: InsightGenerationConfigSnapshot): number {
	return Math.max(
		1,
		Math.min(10, config.maxInsightsPerWebsite || DEFAULT_MAX_INSIGHTS)
	);
}

function excludedRefreshSet() {
	const columns = getTableColumns(analyticsInsights);
	return Object.fromEntries(
		REFRESHED_INSIGHT_COLUMNS.map((key) => [
			key,
			sql.raw(`excluded.${columns[key].name}`),
		])
	);
}

function dedupeKeyFor(insight: GeneratedWebsiteInsight): string {
	return insightDedupeKey({
		...insight,
		changePercent: insight.changePercent ?? null,
	});
}

interface DedupeKeyRow {
	changePercent: number | null;
	dedupeKey: string | null;
	sentiment: string;
	subjectKey: string;
	title: string;
	type: string;
	websiteId: string;
}

function resolveDedupeKey(row: DedupeKeyRow): string {
	return (
		row.dedupeKey ??
		insightDedupeKey({
			websiteId: row.websiteId,
			type: row.type as ParsedInsight["type"],
			sentiment: row.sentiment as ParsedInsight["sentiment"],
			changePercent: row.changePercent,
			subjectKey: row.subjectKey,
			title: row.title,
		})
	);
}

async function fetchInsightDedupeKeyToIdMap(
	organizationId: string,
	cooldownHours: number
): Promise<Map<string, string>> {
	const cutoff = dayjs().subtract(Math.max(1, cooldownHours), "hour").toDate();
	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
			dedupeKey: analyticsInsights.dedupeKey,
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
		const key = resolveDedupeKey(row);
		if (!map.has(key)) {
			map.set(key, row.id);
		}
	}
	return map;
}

interface DismissedBaseline {
	changePercent: number | null;
	severity: string;
}

async function fetchDismissedBaselines(
	organizationId: string
): Promise<Map<string, DismissedBaseline>> {
	const cutoff = dayjs()
		.subtract(DISMISSAL_SUPPRESSION_LOOKBACK_DAYS, "day")
		.toDate();
	const rows = await db
		.select({
			dedupeKey: analyticsInsights.dedupeKey,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			subjectKey: analyticsInsights.subjectKey,
			title: analyticsInsights.title,
			severity: analyticsInsights.severity,
			changePercent: analyticsInsights.changePercent,
		})
		.from(insightUserFeedback)
		.innerJoin(
			analyticsInsights,
			eq(insightUserFeedback.insightId, analyticsInsights.id)
		)
		.where(
			and(
				eq(insightUserFeedback.organizationId, organizationId),
				eq(insightUserFeedback.vote, "dismissed"),
				gte(insightUserFeedback.createdAt, cutoff)
			)
		)
		.orderBy(desc(insightUserFeedback.createdAt));

	const map = new Map<string, DismissedBaseline>();
	for (const row of rows) {
		const key = resolveDedupeKey(row);
		if (!map.has(key)) {
			map.set(key, {
				changePercent: row.changePercent,
				severity: row.severity,
			});
		}
	}
	return map;
}

export function isMateriallyWorse(
	candidate: { changePercent?: number | null; severity: string },
	baseline: DismissedBaseline
): boolean {
	const candidateRank = SEVERITY_RANK[candidate.severity] ?? 0;
	const baselineRank = SEVERITY_RANK[baseline.severity] ?? 0;
	if (candidateRank > baselineRank) {
		return true;
	}
	const baselineMagnitude = Math.abs(baseline.changePercent ?? 0);
	const candidateMagnitude = Math.abs(candidate.changePercent ?? 0);
	return (
		baselineMagnitude > 0 &&
		candidateMagnitude >= baselineMagnitude * MATERIALLY_WORSE_MULTIPLIER
	);
}

export async function persistWebsiteInsights(params: {
	config: InsightGenerationConfigSnapshot;
	insights: GeneratedWebsiteInsight[];
	organizationId: string;
	period: WeekOverWeekPeriod;
	runId: string;
}): Promise<(GeneratedWebsiteInsight & { isNew: boolean })[]> {
	const startedAt = performance.now();
	const [dedupeKeyToId, dismissedBaselines] = await Promise.all([
		fetchInsightDedupeKeyToIdMap(
			params.organizationId,
			params.config.cooldownHours
		),
		fetchDismissedBaselines(params.organizationId),
	]);
	const seenInBatch = new Set<string>();
	const finalInsights: GeneratedWebsiteInsight[] = [];
	let duplicateCandidates = 0;
	let suppressedByDismissal = 0;

	for (const insight of [...params.insights].sort(
		(a, b) => b.priority - a.priority
	)) {
		const key = dedupeKeyFor(insight);
		if (seenInBatch.has(key)) {
			duplicateCandidates += 1;
			continue;
		}
		seenInBatch.add(key);
		const dismissed = dismissedBaselines.get(key);
		if (dismissed && !isMateriallyWorse(insight, dismissed)) {
			suppressedByDismissal += 1;
			continue;
		}
		const existingId = dedupeKeyToId.get(key);
		finalInsights.push(existingId ? { ...insight, id: existingId } : insight);
		if (finalInsights.length >= maxInsights(params.config)) {
			break;
		}
	}

	if (suppressedByDismissal > 0) {
		emitInsightsEvent("info", "generation.persistence.suppressed_dismissed", {
			organization_id: params.organizationId,
			run_id: params.runId,
			suppressed_count: suppressedByDismissal,
		});
	}

	if (finalInsights.length === 0) {
		emitInsightsEvent("info", "generation.persistence.skipped_empty", {
			organization_id: params.organizationId,
			run_id: params.runId,
			candidate_count: params.insights.length,
			duplicate_candidate_count: duplicateCandidates,
			suppressed_dismissed_count: suppressedByDismissal,
			dedupe_window_count: dedupeKeyToId.size,
		});
		return [];
	}

	function insightRow(insight: GeneratedWebsiteInsight, key: string) {
		return {
			id: insight.id,
			organizationId: params.organizationId,
			websiteId: insight.websiteId,
			runId: params.runId,
			title: insight.title,
			description: insight.description,
			suggestion: insight.suggestion,
			severity: insight.severity,
			sentiment: insight.sentiment,
			type: insight.type,
			priority: insight.priority,
			changePercent: insight.changePercent ?? null,
			dedupeKey: key,
			subjectKey: insight.subjectKey,
			sources: insight.sources,
			confidence: insight.confidence,
			impactSummary: insight.impactSummary ?? null,
			rootCause: insight.rootCause ?? null,
			evidence: insight.evidence ?? null,
			investigationDepth: insight.investigationDepth ?? null,
			actions: insight.actions ?? null,
			metrics: insight.metrics as InsightMetricRow[],
			timezone: params.config.timezone,
			currentPeriodFrom: params.period.current.from,
			currentPeriodTo: params.period.current.to,
			previousPeriodFrom: params.period.previous.from,
			previousPeriodTo: params.period.previous.to,
		};
	}

	const insightsWithKeys = finalInsights.map((insight) => {
		const key = dedupeKeyFor(insight);
		const existingId = dedupeKeyToId.get(key);
		const isRefresh = existingId !== undefined && insight.id === existingId;
		return { insight, key, isRefresh };
	});

	const toInsert = insightsWithKeys
		.filter((i) => !i.isRefresh)
		.map(({ insight, key }) => insightRow(insight, key));

	const toRefresh = insightsWithKeys
		.filter((i) => i.isRefresh)
		.map(({ insight, key }) => ({
			id: insight.id,
			row: insightRow(insight, key),
		}));

	if (toInsert.length > 0) {
		await db
			.insert(analyticsInsights)
			.values(toInsert)
			.onConflictDoUpdate({
				target: [analyticsInsights.organizationId, analyticsInsights.dedupeKey],
				targetWhere: isNotNull(analyticsInsights.dedupeKey),
				set: {
					runId: params.runId,
					timezone: params.config.timezone,
					currentPeriodFrom: params.period.current.from,
					currentPeriodTo: params.period.current.to,
					previousPeriodFrom: params.period.previous.from,
					previousPeriodTo: params.period.previous.to,
					createdAt: new Date(),
					...excludedRefreshSet(),
				},
			});
	}
	await Promise.all(
		toRefresh.map(({ id, row }) =>
			db
				.update(analyticsInsights)
				.set({ ...row, createdAt: new Date() })
				.where(eq(analyticsInsights.id, id))
		)
	);

	const persistedRows = await db
		.select({
			dedupeKey: analyticsInsights.dedupeKey,
			id: analyticsInsights.id,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, params.organizationId),
				inArray(
					analyticsInsights.dedupeKey,
					finalInsights.map((insight) => dedupeKeyFor(insight))
				)
			)
		);
	const persistedIdByDedupeKey = new Map(
		persistedRows.flatMap((row) =>
			row.dedupeKey ? [[row.dedupeKey, row.id] as const] : []
		)
	);
	const refreshedKeys = new Set(
		insightsWithKeys.filter((i) => i.isRefresh).map((i) => i.key)
	);
	const persistedInsights = finalInsights.map((insight) => {
		const key = dedupeKeyFor(insight);
		return {
			...insight,
			id: persistedIdByDedupeKey.get(key) ?? insight.id,
			isNew: !refreshedKeys.has(key),
		};
	});

	const websiteInvalidations = [
		...new Set(persistedInsights.map((insight) => insight.websiteId)),
	].map((websiteId) => invalidateAgentContextSnapshotsForWebsite(websiteId));

	await Promise.all([
		invalidateInsightsCachesForOrganization(params.organizationId),
		...websiteInvalidations,
	]);

	emitInsightsEvent("info", "generation.persistence.completed", {
		organization_id: params.organizationId,
		run_id: params.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		result_count: persistedInsights.length,
		insert_count: toInsert.length,
		refresh_count: toRefresh.length,
		suppressed_dismissed_count: suppressedByDismissal,
		invalidated_website_count: websiteInvalidations.length,
	});

	return persistedInsights;
}
