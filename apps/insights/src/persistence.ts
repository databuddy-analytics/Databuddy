import {
	and,
	db,
	desc,
	eq,
	getTableColumns,
	isNotNull,
	lte,
	or,
	sql,
} from "@databuddy/db";
import { analyticsInsights, insightObservations } from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";

const REFRESHED_INSIGHT_COLUMNS = [
	"title",
	"description",
	"severity",
	"sentiment",
	"changePercent",
	"subjectKey",
	"timezone",
] as const satisfies readonly (keyof typeof analyticsInsights.$inferInsert)[];

export interface WebsiteInvestigation {
	id: string;
	outcome: InvestigationOutcome;
	signal: InvestigationSignal;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export function isVisibleInvestigation(
	investigation: Pick<WebsiteInvestigation, "outcome">
): boolean {
	const next = investigation.outcome.next.type;
	return (
		next === "act" ||
		next === "ask" ||
		(investigation.outcome.publish === true &&
			investigation.outcome.recommendation != null)
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

function dedupeKeyFor(investigation: WebsiteInvestigation): string {
	return `${investigation.websiteId}|${investigation.signal.signalKey}`;
}

interface PriorInsightRow {
	dedupeKey: string | null;
	id: string;
	status: "open" | "resolved";
}

async function fetchPriorInsight(
	organizationId: string,
	investigation: WebsiteInvestigation,
	dedupeKey: string
): Promise<PriorInsightRow | undefined> {
	const [row] = await db
		.select({
			dedupeKey: analyticsInsights.dedupeKey,
			id: analyticsInsights.id,
			status: analyticsInsights.status,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, organizationId),
				eq(analyticsInsights.websiteId, investigation.websiteId),
				or(
					eq(analyticsInsights.dedupeKey, dedupeKey),
					eq(analyticsInsights.subjectKey, investigation.signal.signalKey)
				)
			)
		)
		.orderBy(
			sql`${analyticsInsights.dedupeKey} = ${dedupeKey} desc`,
			desc(analyticsInsights.createdAt),
			desc(analyticsInsights.id)
		)
		.limit(1);
	return row;
}

export function caseValues(
	investigation: Pick<WebsiteInvestigation, "outcome" | "signal">,
	timezone: string
) {
	const { outcome, signal } = investigation;
	return {
		changePercent: signal.changePercent,
		description: outcome.summary,
		sentiment: signal.sentiment,
		severity: signal.severity,
		subjectKey: signal.signalKey,
		timezone,
		title: outcome.title,
	};
}

export async function persistInvestigation(params: {
	evidence?: string[];
	investigation: WebsiteInvestigation;
	notNewerThan: Date;
	organizationId: string;
	recheckAt: Date;
	runId: string;
	timezone: string;
}): Promise<WebsiteInvestigation | null> {
	const startedAt = performance.now();
	const key = dedupeKeyFor(params.investigation);
	const prior = await fetchPriorInsight(
		params.organizationId,
		params.investigation,
		key
	);
	const investigation = prior
		? { ...params.investigation, id: prior.id }
		: params.investigation;
	const persistedAt = params.notNewerThan;
	const visible = isVisibleInvestigation(investigation);
	const quietContinuation =
		prior?.status === "open" &&
		(investigation.outcome.next.type === "watch" ||
			investigation.outcome.next.type === "resolve");
	const shouldPersistCase = visible || quietContinuation;
	const open = investigation.outcome.next.type !== "resolve";
	const resolvedAt = open ? null : persistedAt;
	const resolvedReason = open ? null : ("recovered" as const);
	const status: "open" | "resolved" = open ? "open" : "resolved";

	function caseRow(value: WebsiteInvestigation, dedupeKey: string) {
		return {
			id: value.id,
			organizationId: params.organizationId,
			websiteId: value.websiteId,
			dedupeKey,
			...caseValues(value, params.timezone),
			createdAt: persistedAt,
			resolvedAt,
			resolvedReason,
			status,
		};
	}

	const persisted = await db.transaction(async (tx) => {
		const rows = shouldPersistCase
			? prior && (prior.dedupeKey !== key || !visible)
				? await tx
						.update(analyticsInsights)
						.set(caseRow(investigation, key))
						.where(
							and(
								eq(analyticsInsights.id, prior.id),
								lte(analyticsInsights.createdAt, params.notNewerThan),
								quietContinuation
									? eq(analyticsInsights.status, "open")
									: undefined
							)
						)
						.returning({ id: analyticsInsights.id })
				: await tx
						.insert(analyticsInsights)
						.values(caseRow(investigation, key))
						.onConflictDoUpdate({
							target: [
								analyticsInsights.organizationId,
								analyticsInsights.dedupeKey,
							],
							targetWhere: isNotNull(analyticsInsights.dedupeKey),
							setWhere: lte(analyticsInsights.createdAt, params.notNewerThan),
							set: {
								createdAt: persistedAt,
								status,
								resolvedAt,
								resolvedReason,
								...excludedRefreshSet(),
							},
						})
						.returning({ id: analyticsInsights.id })
			: [];
		if (shouldPersistCase && !rows[0]) {
			throw new Error(
				"The investigation changed while scheduled analysis was running"
			);
		}
		const observations = await tx
			.insert(insightObservations)
			.values({
				asOf: persistedAt,
				evidence: params.evidence ?? [],
				id: randomUUIDv7(),
				insightId: rows[0]?.id ?? null,
				organizationId: params.organizationId,
				outcome: investigation.outcome,
				recheckAt: params.recheckAt,
				runId: params.runId,
				signal: investigation.signal,
				signalKey: investigation.signal.signalKey,
				websiteId: investigation.websiteId,
			})
			.onConflictDoNothing({
				target: [
					insightObservations.runId,
					insightObservations.websiteId,
					insightObservations.signalKey,
				],
			})
			.returning({ id: insightObservations.id });
		if (observations.length === 0) {
			throw new Error(
				"This website run already has an outcome for this signal"
			);
		}
		return rows[0] ?? null;
	});

	try {
		await Promise.all([
			invalidateInsightsCachesForOrganization(params.organizationId),
			invalidateAgentContextSnapshotsForWebsite(investigation.websiteId),
		]);
	} catch (error) {
		captureInsightsError(error, "generation.cache_invalidation.failed", {
			organization_id: params.organizationId,
			website_id: investigation.websiteId,
		});
	}

	emitInsightsEvent("info", "generation.persistence.completed", {
		organization_id: params.organizationId,
		run_id: params.runId,
		duration_ms: Math.round(performance.now() - startedAt),
		is_new: visible && prior === undefined,
		visible,
	});

	return visible && persisted ? { ...investigation, id: persisted.id } : null;
}
