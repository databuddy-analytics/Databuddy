import {
	and,
	db,
	desc,
	eq,
	getTableColumns,
	gte,
	inArray,
	isNotNull,
	or,
	sql,
} from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import {
	insightDedupeKey,
	type GeneratedInsight,
	type WeekOverWeekPeriod,
} from "@databuddy/shared/insights";
import dayjs from "dayjs";
import { emitInsightsEvent } from "./lib/evlog-insights";
import { INSIGHT_COOLDOWN_HOURS } from "./policy";

const OPEN_INSIGHT_LOOKBACK_DAYS = 90;
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
	"remediationKind",
	"evidence",
	"actions",
	"metrics",
	"timezone",
	"currentPeriodFrom",
	"currentPeriodTo",
	"previousPeriodFrom",
	"previousPeriodTo",
] as const satisfies readonly (keyof typeof analyticsInsights.$inferInsert)[];

export interface GeneratedWebsiteInsight extends GeneratedInsight {
	id: string;
	period: WeekOverWeekPeriod;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
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

type DedupeKeyRow = Pick<
	typeof analyticsInsights.$inferSelect,
	| "changePercent"
	| "dedupeKey"
	| "sentiment"
	| "subjectKey"
	| "title"
	| "type"
	| "websiteId"
>;

function resolveDedupeKey(row: DedupeKeyRow): string {
	return (
		row.dedupeKey ??
		insightDedupeKey({
			websiteId: row.websiteId,
			type: row.type,
			sentiment: row.sentiment,
			changePercent: row.changePercent,
			subjectKey: row.subjectKey,
			title: row.title,
		})
	);
}

export interface PriorInsightRow {
	changePercent: number | null;
	createdAt: Date;
	id: string;
	runId: string;
	severity: string;
	status: string;
}

async function fetchPriorInsightsByDedupeKey(
	organizationId: string,
	cooldownCutoff: Date
): Promise<Map<string, PriorInsightRow>> {
	const openCutoff = dayjs()
		.subtract(OPEN_INSIGHT_LOOKBACK_DAYS, "day")
		.toDate();
	const rows = await db
		.select({
			id: analyticsInsights.id,
			runId: analyticsInsights.runId,
			websiteId: analyticsInsights.websiteId,
			type: analyticsInsights.type,
			sentiment: analyticsInsights.sentiment,
			changePercent: analyticsInsights.changePercent,
			dedupeKey: analyticsInsights.dedupeKey,
			subjectKey: analyticsInsights.subjectKey,
			title: analyticsInsights.title,
			severity: analyticsInsights.severity,
			status: analyticsInsights.status,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				or(
					gte(analyticsInsights.createdAt, cooldownCutoff),
					and(
						eq(analyticsInsights.status, "open"),
						gte(analyticsInsights.createdAt, openCutoff)
					)
				)
			)
		)
		.orderBy(desc(analyticsInsights.createdAt));

	const map = new Map<string, PriorInsightRow>();
	for (const row of rows) {
		const key = resolveDedupeKey(row);
		if (!map.has(key)) {
			map.set(key, {
				id: row.id,
				runId: row.runId,
				changePercent: row.changePercent,
				createdAt: row.createdAt,
				severity: row.severity,
				status: row.status,
			});
		}
	}
	return map;
}

export function classifyRecurrence(
	candidate: { changePercent?: number | null; severity: string },
	prior: PriorInsightRow | undefined,
	cooldownCutoff: Date
): { isEscalation: boolean; isNew: boolean; isPersistent: boolean } {
	if (!prior || prior.status !== "open") {
		return { isEscalation: false, isNew: true, isPersistent: false };
	}
	if (
		isMateriallyWorse(candidate, {
			changePercent: prior.changePercent,
			severity: prior.severity,
		})
	) {
		return { isEscalation: true, isNew: false, isPersistent: false };
	}
	if (prior.createdAt >= cooldownCutoff) {
		return { isEscalation: false, isNew: false, isPersistent: false };
	}
	return {
		isEscalation: false,
		isNew: false,
		isPersistent: candidate.severity === "critical",
	};
}

interface ChangeBaseline {
	changePercent: number | null;
	severity: string;
}

export function isMateriallyWorse(
	candidate: { changePercent?: number | null; severity: string },
	baseline: ChangeBaseline
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
	insights: GeneratedWebsiteInsight[];
	organizationId: string;
	runId: string;
	timezone: string;
}): Promise<
	(GeneratedWebsiteInsight & {
		isEscalation: boolean;
		isNew: boolean;
		isPersistent: boolean;
		isRetry: boolean;
	})[]
> {
	const startedAt = performance.now();
	const cooldownCutoff = dayjs()
		.subtract(INSIGHT_COOLDOWN_HOURS, "hour")
		.toDate();
	const priorByDedupeKey = await fetchPriorInsightsByDedupeKey(
		params.organizationId,
		cooldownCutoff
	);
	const seenInBatch = new Set<string>();
	const finalInsights: GeneratedWebsiteInsight[] = [];
	const classificationByKey = new Map<
		string,
		{
			isEscalation: boolean;
			isNew: boolean;
			isPersistent: boolean;
			isRetry: boolean;
		}
	>();
	let duplicateCandidates = 0;

	for (const insight of [...params.insights].sort(
		(a, b) => b.priority - a.priority
	)) {
		const key = dedupeKeyFor(insight);
		if (seenInBatch.has(key)) {
			duplicateCandidates += 1;
			continue;
		}
		seenInBatch.add(key);
		const prior = priorByDedupeKey.get(key);
		classificationByKey.set(key, {
			...classifyRecurrence(insight, prior, cooldownCutoff),
			isRetry: prior?.runId === params.runId,
		});
		finalInsights.push(prior ? { ...insight, id: prior.id } : insight);
	}

	if (finalInsights.length === 0) {
		emitInsightsEvent("info", "generation.persistence.skipped_empty", {
			organization_id: params.organizationId,
			run_id: params.runId,
			candidate_count: params.insights.length,
			duplicate_candidate_count: duplicateCandidates,
			dedupe_window_count: priorByDedupeKey.size,
		});
		return [];
	}

	function insightRow(insight: GeneratedWebsiteInsight, key: string) {
		const period = insight.period;
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
			remediationKind: insight.remediationKind ?? null,
			evidence: insight.evidence ?? null,
			actions: null,
			metrics: insight.metrics,
			timezone: params.timezone,
			currentPeriodFrom: period.current.from,
			currentPeriodTo: period.current.to,
			previousPeriodFrom: period.previous.from,
			previousPeriodTo: period.previous.to,
		};
	}

	const insightsWithKeys = finalInsights.map((insight) => {
		const key = dedupeKeyFor(insight);
		const prior = priorByDedupeKey.get(key);
		const isRefresh = prior !== undefined && insight.id === prior.id;
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
					createdAt: new Date(),
					status: "open",
					resolvedAt: null,
					resolvedReason: null,
					...excludedRefreshSet(),
				},
			});
	}
	await Promise.all(
		toRefresh.map(({ id, row }) =>
			db
				.update(analyticsInsights)
				.set({
					...row,
					createdAt: new Date(),
					status: "open",
					resolvedAt: null,
					resolvedReason: null,
				})
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
	const persistedInsights = finalInsights.map((insight) => {
		const key = dedupeKeyFor(insight);
		const classification = classificationByKey.get(key) ?? {
			isEscalation: false,
			isNew: true,
			isPersistent: false,
			isRetry: false,
		};
		return {
			...insight,
			id: persistedIdByDedupeKey.get(key) ?? insight.id,
			isEscalation: classification.isEscalation,
			isNew: classification.isNew,
			isPersistent: classification.isPersistent,
			isRetry: classification.isRetry,
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
		invalidated_website_count: websiteInvalidations.length,
	});

	return persistedInsights;
}
