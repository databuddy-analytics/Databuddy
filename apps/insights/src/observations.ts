import { and, db, desc, eq, inArray, lt, lte, or } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
} from "@databuddy/db/schema";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { parseInvestigationOutcome } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import type { InsightAgentInput } from "./agent";
import { isRegression, signalKeyForDetectedSignal } from "./investigation";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 40;
const MATERIALLY_WORSE_MULTIPLIER = 1.5;
const SEVERITY_RANK: Record<string, number> = {
	info: 0,
	warning: 1,
	critical: 2,
};

function isMateriallyWorse(
	candidate: { changePercent?: number | null; severity: string },
	baseline: { changePercent: number | null; severity: string }
): boolean {
	if (
		(SEVERITY_RANK[candidate.severity] ?? 0) >
		(SEVERITY_RANK[baseline.severity] ?? 0)
	) {
		return true;
	}
	const baselineMagnitude = Math.abs(baseline.changePercent ?? 0);
	return (
		baselineMagnitude > 0 &&
		Math.abs(candidate.changePercent ?? 0) >=
			baselineMagnitude * MATERIALLY_WORSE_MULTIPLIER
	);
}

export type LatestInsightObservation = Pick<
	typeof insightObservations.$inferSelect,
	"asOf" | "evidence" | "outcome" | "recheckAt" | "signal"
>;

export function nextRecheckAt(
	asOf: Date,
	next: InvestigationOutcome["next"]["type"]
): Date {
	const days = next === "act" || next === "watch" ? 7 : 30;
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
		} else if (
			observation.outcome.next.type !== "resolve" &&
			observation.recheckAt <= asOf
		) {
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
			evidence: insightObservations.evidence,
			outcome: insightObservations.outcome,
			signalKey: insightObservations.signalKey,
			signal: insightObservations.signal,
			recheckAt: insightObservations.recheckAt,
		})
		.from(insightObservations)
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

	const observations = new Map<string, LatestInsightObservation>();
	for (const row of rows) {
		const outcome = parseInvestigationOutcome(row.outcome);
		if (outcome) {
			observations.set(row.signalKey, { ...row, outcome });
		}
	}
	return observations;
}

export async function loadInvestigationHistory(params: {
	beforeReply?: { createdAt: Date; id: string };
	insightId?: string;
	organizationId: string;
	signalKey: string;
	through?: Date;
	websiteId: string;
}): Promise<InsightAgentInput["history"]> {
	const hasSignal = params.signalKey.trim().length > 0;
	const observationCase = hasSignal
		? and(
				eq(insightObservations.organizationId, params.organizationId),
				eq(insightObservations.websiteId, params.websiteId),
				eq(insightObservations.signalKey, params.signalKey)
			)
		: eq(insightObservations.insightId, params.insightId ?? "");
	const replyCase = hasSignal
		? and(
				eq(analyticsInsights.organizationId, params.organizationId),
				eq(analyticsInsights.websiteId, params.websiteId),
				eq(analyticsInsights.subjectKey, params.signalKey)
			)
		: eq(insightReplies.insightId, params.insightId ?? "");

	const [observations, replies] = await Promise.all([
		db
			.select({
				asOf: insightObservations.asOf,
				createdAt: insightObservations.createdAt,
				evidence: insightObservations.evidence,
				id: insightObservations.id,
				outcome: insightObservations.outcome,
				signal: insightObservations.signal,
			})
			.from(insightObservations)
			.where(
				and(
					observationCase,
					params.through
						? and(
								lte(insightObservations.asOf, params.through),
								lte(insightObservations.createdAt, params.through)
							)
						: undefined
				)
			)
			.orderBy(
				desc(insightObservations.createdAt),
				desc(insightObservations.id)
			)
			.limit(HISTORY_LIMIT),
		db
			.select({
				author: insightReplies.authorName,
				body: insightReplies.body,
				createdAt: insightReplies.createdAt,
				id: insightReplies.id,
			})
			.from(insightReplies)
			.innerJoin(
				analyticsInsights,
				eq(insightReplies.insightId, analyticsInsights.id)
			)
			.where(
				and(
					replyCase,
					params.through
						? lte(insightReplies.createdAt, params.through)
						: undefined,
					params.beforeReply
						? or(
								lt(insightReplies.createdAt, params.beforeReply.createdAt),
								and(
									eq(insightReplies.createdAt, params.beforeReply.createdAt),
									lt(insightReplies.id, params.beforeReply.id)
								)
							)
						: undefined
				)
			)
			.orderBy(desc(insightReplies.createdAt), desc(insightReplies.id))
			.limit(HISTORY_LIMIT),
	]);

	return [
		...observations.flatMap((observation) => {
			const outcome = parseInvestigationOutcome(observation.outcome);
			return outcome
				? [
						{
							createdAt: observation.createdAt,
							id: observation.id,
							item: {
								asOf: observation.asOf.toISOString(),
								evidence: observation.evidence,
								kind: "investigation" as const,
								outcome,
								signal: observation.signal,
							},
						},
					]
				: [];
		}),
		...replies.map((reply) => ({
			createdAt: reply.createdAt,
			id: reply.id,
			item: {
				author: reply.author,
				body: reply.body,
				createdAt: reply.createdAt.toISOString(),
				kind: "reply" as const,
			},
		})),
	]
		.sort(
			(a, b) =>
				a.createdAt.getTime() - b.createdAt.getTime() ||
				a.id.localeCompare(b.id)
		)
		.slice(-HISTORY_LIMIT)
		.map((entry) => entry.item);
}

export async function findRunObservation(params: {
	organizationId: string;
	runId: string;
	websiteId: string;
}) {
	const [observation] = await db
		.select({
			insightId: insightObservations.insightId,
			outcome: insightObservations.outcome,
			signal: insightObservations.signal,
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
	if (!observation) {
		return;
	}
	const outcome = parseInvestigationOutcome(observation.outcome);
	return outcome ? { ...observation, outcome } : undefined;
}
