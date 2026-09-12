import type { BusinessScope } from "@databuddy/ai/lib/business-context";
import { assertBusinessScopeCurrent } from "./business-context";
import {
	and,
	db,
	desc,
	eq,
	isNotNull,
	isNull,
	lte,
	or,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	organization,
	websites,
} from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import type {
	InvestigationOutcome,
	InvestigationSignal,
	InvestigationEvidenceSnapshot,
} from "@databuddy/shared/insights";
import { organizationBusinessContextSchema } from "@databuddy/shared/organization-business-context";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { normalizedErrorSubject } from "./investigation";
import { captureInsightsError, emitInsightsEvent } from "./lib/evlog-insights";
import { measurementPlanKey } from "./measurement-plan";
import type { DueOpenInvestigation } from "./observations";
import { commitInvestigationCharge } from "./investigation-billing";

export async function retireObsoleteRetentionObservation(params: {
	asOf: Date;
	domain: string;
	observation: DueOpenInvestigation;
	organizationId: string;
	websiteId: string;
}): Promise<boolean> {
	const { observation } = params;
	const signalKey = observation.signal.signalKey;
	const insightId = observation.insightId;
	if (!(signalKey.startsWith("retention:") && observation.id && insightId)) {
		return false;
	}
	const retired = await db.transaction(async (tx) => {
		// Match settings-save lock order and hold the canonical definition stable
		// through the transition. A failed read must roll back, never imply removal.
		const [owner] = await tx
			.select({ metadata: organization.metadata })
			.from(organization)
			.where(eq(organization.id, params.organizationId))
			.for("no key update");
		const [site] = await tx
			.select({ id: websites.id })
			.from(websites)
			.where(
				and(
					eq(websites.id, params.websiteId),
					eq(websites.organizationId, params.organizationId),
					eq(websites.domain, params.domain),
					isNull(websites.deletedAt)
				)
			)
			.for("update");
		if (!(owner?.metadata && site)) {
			return false;
		}
		const { businessContext } = z
			.object({ businessContext: organizationBusinessContextSchema.optional() })
			.parse(JSON.parse(owner.metadata));
		const profile = businessContext?.profile;
		if (
			!profile?.measurementPlans ||
			Date.parse(profile.updatedAt) > params.asOf.getTime() ||
			profile.measurementPlans.some(
				(plan) =>
					plan.websiteId === params.websiteId &&
					plan.domain === params.domain &&
					measurementPlanKey(plan) === signalKey
			)
		) {
			return false;
		}
		const scope = and(
			eq(analyticsInsights.id, insightId),
			eq(analyticsInsights.organizationId, params.organizationId),
			eq(analyticsInsights.websiteId, params.websiteId),
			eq(analyticsInsights.subjectKey, signalKey),
			eq(analyticsInsights.status, "open"),
			lte(analyticsInsights.createdAt, params.asOf)
		);
		const [current] = await tx
			.select({ id: analyticsInsights.id })
			.from(analyticsInsights)
			.where(scope)
			.for("update");
		if (!current) {
			return false;
		}
		const [latest] = await tx
			.select()
			.from(insightObservations)
			.where(
				and(
					eq(insightObservations.organizationId, params.organizationId),
					eq(insightObservations.websiteId, params.websiteId),
					eq(insightObservations.signalKey, signalKey)
				)
			)
			.orderBy(
				desc(insightObservations.asOf),
				desc(insightObservations.createdAt)
			)
			.limit(1);
		if (
			latest?.id !== observation.id ||
			latest.insightId !== current.id ||
			latest.asOf > params.asOf ||
			latest.createdAt > params.asOf ||
			latest.recheckAt > params.asOf ||
			latest.outcome.next.type === "resolve"
		) {
			return false;
		}
		const reason =
			"The saved activation and return definition was removed or changed. This investigation's measurement no longer applies; recovery was not measured.";
		await tx
			.update(analyticsInsights)
			.set({
				// Supersede even an in-flight write with this exact snapshot time.
				// The existing UPDATE/UPSERT fences both compare createdAt with <=.
				createdAt: new Date(params.asOf.getTime() + 1),
				status: "resolved",
				resolvedAt: params.asOf,
				resolvedReason: "stale",
			})
			.where(scope);
		await tx.insert(insightObservations).values({
			id: randomUUIDv7(),
			insightId: current.id,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			signalKey,
			signal: latest.signal,
			evidence: [reason],
			outcome: {
				title: latest.outcome.title,
				summary: reason,
				evidence: [reason],
				rootCause: null,
				impact: null,
				publish: false,
				next: { type: "resolve", reason },
			},
			asOf: params.asOf,
			recheckAt: params.asOf,
		});
		return true;
	});
	if (retired) {
		try {
			await Promise.all([
				invalidateInsightsCachesForOrganization(params.organizationId),
				invalidateAgentContextSnapshotsForWebsite(params.websiteId),
			]);
		} catch (error) {
			captureInsightsError(error, "generation.cache_invalidation.failed", {
				organization_id: params.organizationId,
				website_id: params.websiteId,
			});
		}
	}
	return retired;
}

export interface WebsiteInvestigation {
	id: string;
	outcome: InvestigationOutcome;
	signal: InvestigationSignal;
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

export function isInterruptingInvestigation(
	investigation: Pick<WebsiteInvestigation, "outcome">
): boolean {
	const next = investigation.outcome.next.type;
	return next === "act" || next === "ask";
}

function dedupeKeyFor(investigation: WebsiteInvestigation): string {
	return `${investigation.websiteId}|${normalizedErrorSubject(investigation.signal.signalKey)}`;
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
	timezone: string,
	at: Date
) {
	const { outcome, signal } = investigation;
	return {
		changePercent: signal.changePercent,
		description: outcome.summary,
		createdAt: at,
		resolvedAt: outcome.next.type === "resolve" ? at : null,
		resolvedReason:
			outcome.next.type === "resolve" &&
			(!outcome.verification || outcome.verification.status === "passed")
				? ("recovered" as const)
				: null,
		status:
			outcome.next.type === "resolve"
				? ("resolved" as const)
				: ("open" as const),
		sentiment: signal.sentiment,
		severity: signal.severity,
		subjectKey: signal.signalKey,
		timezone,
		title: outcome.title,
	};
}

export async function persistInvestigation(params: {
	charge?: { id: string; mode: "fixed" | "legacy" | "unconfigured" };
	completion?: "complete" | "incomplete";
	snapshot?: InvestigationEvidenceSnapshot;
	businessScope?: BusinessScope;
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
	const interrupting = isInterruptingInvestigation(investigation);
	const quietContinuation =
		prior?.status === "open" &&
		(investigation.outcome.next.type === "watch" ||
			investigation.outcome.next.type === "resolve");
	const completedFixedUnit =
		params.charge?.mode === "fixed" &&
		params.completion === "complete" &&
		params.snapshot?.completion === "complete";
	const shouldPersistCase =
		interrupting || quietContinuation || completedFixedUnit;
	const projection = caseValues(investigation, params.timezone, persistedAt);
	const row = {
		...projection,
		id: investigation.id,
		organizationId: params.organizationId,
		websiteId: investigation.websiteId,
		dedupeKey: key,
	};

	const persisted = await db.transaction(async (tx) => {
		if (params.businessScope) {
			await assertBusinessScopeCurrent(params.businessScope, tx);
		}
		const rows = shouldPersistCase
			? prior && (prior.dedupeKey !== key || !interrupting)
				? await tx
						.update(analyticsInsights)
						.set(row)
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
						.values(row)
						.onConflictDoUpdate({
							target: [
								analyticsInsights.organizationId,
								analyticsInsights.dedupeKey,
							],
							targetWhere: isNotNull(analyticsInsights.dedupeKey),
							setWhere: lte(analyticsInsights.createdAt, params.notNewerThan),
							set: projection,
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
				snapshot: params.snapshot,
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
		if (params.charge && observations[0]) {
			await commitInvestigationCharge(tx, {
				chargeId: params.charge.id,
				observationId: observations[0].id,
				complete:
					params.charge.mode === "fixed"
						? completedFixedUnit
						: params.completion === "complete",
			});
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
		is_new: interrupting && prior === undefined,
		visible: interrupting,
	});

	return interrupting && persisted
		? { ...investigation, id: persisted.id }
		: null;
}
