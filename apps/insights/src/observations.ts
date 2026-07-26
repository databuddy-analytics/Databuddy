import {
	and,
	db,
	desc,
	eq,
	inArray,
	lt,
	lte,
	ne,
	or,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
} from "@databuddy/db/schema";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import {
	parseInvestigationOutcome,
	parseInvestigationSignal,
} from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import type { InsightAgentInput } from "./agent";
import { isRegression, signalKeyForDetectedSignal } from "./investigation";

const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_LIMIT = 12;
const OTHER_OPEN_WORK_LIMIT = 8;
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
	"outcome" | "recheckAt" | "signal"
>;

export interface DueOpenInvestigation extends LatestInsightObservation {
	evidence: string[];
}

export function nextRecheckAt(
	asOf: Date,
	next: InvestigationOutcome["next"]["type"]
): Date {
	const days = next === "act" || next === "watch" ? 1 : 30;
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
		const recovered =
			observation.outcome.next.type === "resolve" &&
			observation.signal.sentiment === "negative" &&
			!isRegression(signal);
		if (worsened || recovered) {
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
				lte(insightObservations.asOf, params.asOf),
				lte(insightObservations.createdAt, params.asOf)
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
		const signal = parseInvestigationSignal(row.signal);
		if (outcome && signal) {
			observations.set(row.signalKey, { ...row, outcome, signal });
		}
	}
	return observations;
}

export async function loadDueOpenInvestigation(params: {
	asOf: Date;
	organizationId: string;
	websiteId: string;
}): Promise<DueOpenInvestigation | null> {
	const rows = await db
		.selectDistinctOn([insightObservations.signalKey], {
			evidence: insightObservations.evidence,
			outcome: insightObservations.outcome,
			recheckAt: insightObservations.recheckAt,
			signal: insightObservations.signal,
			signalKey: insightObservations.signalKey,
		})
		.from(insightObservations)
		.innerJoin(
			analyticsInsights,
			eq(insightObservations.insightId, analyticsInsights.id)
		)
		.where(
			and(
				eq(insightObservations.organizationId, params.organizationId),
				eq(insightObservations.websiteId, params.websiteId),
				eq(analyticsInsights.status, "open"),
				lte(insightObservations.asOf, params.asOf)
			)
		)
		.orderBy(
			insightObservations.signalKey,
			desc(insightObservations.asOf),
			desc(insightObservations.createdAt)
		);

	return (
		rows
			.flatMap((row) => {
				const outcome = parseInvestigationOutcome(row.outcome);
				const signal = parseInvestigationSignal(row.signal);
				return outcome &&
					signal &&
					outcome.next.type !== "resolve" &&
					row.recheckAt <= params.asOf
					? [{ ...row, outcome, signal }]
					: [];
			})
			.sort((a, b) => a.recheckAt.getTime() - b.recheckAt.getTime())[0] ?? null
	);
}

export async function loadInvestigationHistory(params: {
	beforeReply?: { createdAt: Date; id: string };
	organizationId: string;
	signalKey: string;
	through?: Date;
	websiteId: string;
}): Promise<InsightAgentInput["history"]> {
	const observationCase = and(
		eq(insightObservations.organizationId, params.organizationId),
		eq(insightObservations.websiteId, params.websiteId),
		eq(insightObservations.signalKey, params.signalKey)
	);
	const replyCase = and(
		eq(analyticsInsights.organizationId, params.organizationId),
		eq(analyticsInsights.websiteId, params.websiteId),
		eq(analyticsInsights.subjectKey, params.signalKey)
	);

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
			const signal = parseInvestigationSignal(observation.signal);
			return outcome && signal
				? [
						{
							createdAt: observation.createdAt,
							id: observation.id,
							item: {
								asOf: observation.asOf.toISOString(),
								evidence: observation.evidence,
								kind: "investigation" as const,
								outcome,
								signal,
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

export async function loadOtherOpenWork(params: {
	organizationId: string;
	signalKey: string;
	through: Date;
	websiteId: string;
}): Promise<InsightAgentInput["otherOpenWork"]> {
	const rows = await db
		.selectDistinctOn([insightObservations.signalKey], {
			asOf: insightObservations.asOf,
			createdAt: insightObservations.createdAt,
			id: insightObservations.id,
			outcome: insightObservations.outcome,
			signalKey: insightObservations.signalKey,
		})
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.organizationId, params.organizationId),
				eq(insightObservations.websiteId, params.websiteId),
				ne(insightObservations.signalKey, params.signalKey),
				lte(insightObservations.asOf, params.through),
				lte(insightObservations.createdAt, params.through),
				sql`${insightObservations.outcome}->'next'->>'type' in ('act', 'ask', 'resolve')`
			)
		)
		.orderBy(
			insightObservations.signalKey,
			desc(insightObservations.asOf),
			desc(insightObservations.createdAt),
			desc(insightObservations.id)
		);

	return rows
		.flatMap((row) => {
			const outcome = parseInvestigationOutcome(row.outcome);
			return outcome &&
				(outcome.next.type === "act" || outcome.next.type === "ask")
				? [
						{
							asOf: row.asOf,
							createdAt: row.createdAt,
							id: row.id,
							next: outcome.next,
							title: outcome.title,
						},
					]
				: [];
		})
		.sort(
			(a, b) =>
				b.asOf.getTime() - a.asOf.getTime() ||
				b.createdAt.getTime() - a.createdAt.getTime() ||
				b.id.localeCompare(a.id)
		)
		.slice(0, OTHER_OPEN_WORK_LIMIT)
		.map(({ asOf, next, title }) => ({
			asOf: asOf.toISOString(),
			next,
			title,
		}));
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
	const signal = parseInvestigationSignal(observation.signal);
	return outcome && signal ? { ...observation, outcome, signal } : undefined;
}
