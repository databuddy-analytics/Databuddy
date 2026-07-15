import { and, db, desc, eq, inArray, lte } from "@databuddy/db";
import { analyticsInsights, insightObservations } from "@databuddy/db/schema";
import type {
	GeneratedInsight,
	InvestigationDecision,
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import type { DetectedSignal } from "./detection";
import { isRegression, signalKeyForDetectedSignal } from "./investigation";
import { isMateriallyWorse } from "./persistence";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LatestInsightObservation = Pick<
	typeof insightObservations.$inferSelect,
	"asOf" | "decision" | "evidence" | "recheckAt" | "signal"
> & {
	finding: Pick<
		GeneratedInsight,
		"description" | "suggestion" | "title"
	> | null;
};

export function nextRecheckAt(
	asOf: Date,
	disposition: InvestigationDecision["disposition"],
	signal?: Pick<InvestigationSignal, "kind" | "severity">
): Date {
	const days =
		disposition === "action_ready" ||
		disposition === "monitor" ||
		(disposition === "needs_context" &&
			signal?.kind === "missing_expected_data" &&
			signal.severity === "critical")
			? 7
			: 30;
	return new Date(asOf.getTime() + days * DAY_MS);
}

export function eligibleSignalsForInvestigation(
	signals: DetectedSignal[],
	observations: ReadonlyMap<string, LatestInsightObservation>,
	asOf: Date
): DetectedSignal[] {
	const buckets: [DetectedSignal[], DetectedSignal[], DetectedSignal[]] = [
		[],
		[],
		[],
	];
	for (const signal of signals) {
		const observation = observations.get(signalKeyForDetectedSignal(signal));
		if (!observation) {
			buckets[1].push(signal);
			continue;
		}
		const worsened =
			isRegression(signal) &&
			(observation.signal.sentiment !== "negative" ||
				isMateriallyWorse(
					{ changePercent: signal.deltaPercent, severity: signal.severity },
					{
						changePercent: observation.signal.changePercent,
						severity: observation.signal.severity,
					}
				));
		if (worsened) {
			buckets[0].push(signal);
		} else if (observation.recheckAt <= asOf) {
			buckets[2].push(signal);
		}
	}
	return buckets.flat();
}

export async function loadLatestSignalObservations(params: {
	asOf: Date;
	organizationId: string;
	signalKeys: string[];
	websiteId: string;
}): Promise<Map<string, LatestInsightObservation>> {
	const signalKeys = [...new Set(params.signalKeys)];
	if (signalKeys.length === 0) {
		return new Map();
	}
	const rows = await db
		.selectDistinctOn([insightObservations.signalKey], {
			asOf: insightObservations.asOf,
			decision: insightObservations.decision,
			evidence: insightObservations.evidence,
			findingDescription: analyticsInsights.description,
			findingSuggestion: analyticsInsights.suggestion,
			findingTitle: analyticsInsights.title,
			signalKey: insightObservations.signalKey,
			signal: insightObservations.signal,
			recheckAt: insightObservations.recheckAt,
		})
		.from(insightObservations)
		.leftJoin(
			analyticsInsights,
			and(
				eq(analyticsInsights.id, insightObservations.insightId),
				eq(analyticsInsights.organizationId, params.organizationId),
				eq(analyticsInsights.websiteId, params.websiteId)
			)
		)
		.where(
			and(
				eq(insightObservations.organizationId, params.organizationId),
				eq(insightObservations.websiteId, params.websiteId),
				inArray(insightObservations.signalKey, signalKeys),
				lte(insightObservations.asOf, params.asOf)
			)
		)
		.orderBy(
			insightObservations.signalKey,
			desc(insightObservations.asOf),
			desc(insightObservations.createdAt)
		);

	return new Map(
		rows.map((row) => [
			row.signalKey,
			{
				asOf: row.asOf,
				decision: row.decision,
				evidence: row.evidence,
				finding:
					row.findingDescription && row.findingSuggestion && row.findingTitle
						? {
								description: row.findingDescription,
								suggestion: row.findingSuggestion,
								title: row.findingTitle,
							}
						: null,
				recheckAt: row.recheckAt,
				signal: row.signal,
			},
		])
	);
}

export async function findRunObservation(params: {
	organizationId: string;
	runId: string;
	websiteId: string;
}) {
	const [observation] = await db
		.select({
			disposition: insightObservations.disposition,
			insightId: insightObservations.insightId,
		})
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.runId, params.runId),
				eq(insightObservations.organizationId, params.organizationId),
				eq(insightObservations.websiteId, params.websiteId)
			)
		)
		.limit(1);
	return observation;
}

export async function appendInsightObservation(params: {
	asOf: Date;
	decision: InvestigationDecision;
	evidence: InvestigationEvidence[];
	insightId: string | null;
	organizationId: string;
	recheckAt?: Date;
	runId: string;
	signal: InvestigationSignal;
	websiteId: string;
}): Promise<void> {
	await db
		.insert(insightObservations)
		.values({
			id: randomUUIDv7(),
			runId: params.runId,
			organizationId: params.organizationId,
			websiteId: params.websiteId,
			insightId: params.insightId,
			signalKey: params.signal.signalKey,
			asOf: params.asOf,
			disposition: params.decision.disposition,
			signal: params.signal,
			evidence: params.evidence,
			decision: params.decision,
			recheckAt:
				params.recheckAt ??
				nextRecheckAt(params.asOf, params.decision.disposition, params.signal),
		})
		.onConflictDoNothing({
			target: [insightObservations.runId, insightObservations.websiteId],
		});
}
