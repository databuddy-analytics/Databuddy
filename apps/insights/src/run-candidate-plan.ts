import { db } from "@databuddy/db";
import { insightRunItems } from "@databuddy/db/schema";
import {
	insightMeasurementGapRecommendationSchema,
	investigationSignalSchema,
} from "@databuddy/shared/insights";
import { z } from "zod";
import {
	coveragePortfolioLimit,
	type CoveragePortfolioReason,
} from "./coverage-planner";
import { type InsightRunIdentity, runIdentityCondition } from "./effects";
import {
	canonicalMeasurementEventTarget,
	canonicalMeasurementRouteTarget,
} from "./measurement-targets";

const frozenPlanReasonSchema = z.enum(["manual", "scheduled"]);
const emptyPlanStatusSchema = z.enum(["deferred", "no_signals"]);
const MAX_MANUAL_CANDIDATES = coveragePortfolioLimit("manual");
export const MAX_COVERED_ROUTE_CONTEXT_SIGNALS = MAX_MANUAL_CANDIDATES;

const measurementCandidateSchema = z
	.discriminatedUnion("kind", [
		z
			.object({
				basis: z.literal("observed_custom_event"),
				kind: z.literal("event_goal_candidate"),
				target: z.string().trim().min(1).max(64),
				type: z.literal("EVENT"),
			})
			.strict(),
		z
			.object({
				basis: z.literal("observed_navigation_proxy"),
				kind: z.literal("page_navigation_proxy"),
				target: z.string().trim().min(1).max(120),
				type: z.literal("PAGE_VIEW"),
			})
			.strict(),
	])
	.superRefine((candidate, context) => {
		const canonical =
			candidate.type === "EVENT"
				? canonicalMeasurementEventTarget(candidate.target)
				: canonicalMeasurementRouteTarget(candidate.target);
		if (canonical !== candidate.target) {
			context.addIssue({
				code: "custom",
				message: "Measurement candidate target must be canonical",
				path: ["target"],
			});
		}
	});

const measurementGapRecommendationCandidateSchema =
	insightMeasurementGapRecommendationSchema.superRefine(
		(candidate, context) => {
			if (
				candidate.route !== null &&
				canonicalMeasurementRouteTarget(candidate.route) !== candidate.route
			) {
				context.addIssue({
					code: "custom",
					message: "Measurement-gap route must be canonical",
					path: ["route"],
				});
			}
		}
	);

function isBroadErrorOwner(signal: z.infer<typeof investigationSignalSchema>) {
	return (
		signal.signalKey.startsWith("error:") && signal.entity.type === "error"
	);
}

function isRouteErrorPage(signal: z.infer<typeof investigationSignalSchema>) {
	return (
		signal.signalKey.startsWith("route:error:") && signal.entity.type === "page"
	);
}

function hasSameComparisonPeriod(
	owner: z.infer<typeof investigationSignalSchema>,
	route: z.infer<typeof investigationSignalSchema>
) {
	return (
		owner.period.current.from === route.period.current.from &&
		owner.period.current.to === route.period.current.to &&
		owner.period.previous.from === route.period.previous.from &&
		owner.period.previous.to === route.period.previous.to
	);
}

const plannedCandidateSchema = z
	.object({
		coveredRouteSignals: z
			.array(investigationSignalSchema)
			.min(1)
			.max(MAX_COVERED_ROUTE_CONTEXT_SIGNALS)
			.optional(),
		/**
		 * Immutable detector context for the agent only. Public artifacts and
		 * observations retain `evidence`, never this definition detail.
		 */
		definitionContext: z.string().max(500).optional(),
		evidence: z.array(z.string().max(500)).max(20),
		measurementCandidate: measurementCandidateSchema.optional(),
		measurementGapRecommendationCandidate:
			measurementGapRecommendationCandidateSchema.optional(),
		signal: investigationSignalSchema,
	})
	.strict()
	.superRefine((candidate, context) => {
		const coveredRoutes = candidate.coveredRouteSignals;
		if (!coveredRoutes) {
			return;
		}
		if (!isBroadErrorOwner(candidate.signal)) {
			context.addIssue({
				code: "custom",
				message: "Covered route context requires an exact broad error owner",
				path: ["coveredRouteSignals"],
			});
		}
		const routeKeys = new Set<string>();
		for (const [index, route] of coveredRoutes.entries()) {
			if (!isRouteErrorPage(route)) {
				context.addIssue({
					code: "custom",
					message:
						"Covered route context must contain exact route-error page signals",
					path: ["coveredRouteSignals", index],
				});
			}
			if (!hasSameComparisonPeriod(candidate.signal, route)) {
				context.addIssue({
					code: "custom",
					message:
						"Covered route context must use the broad error owner's comparison period",
					path: ["coveredRouteSignals", index, "period"],
				});
			}
			if (route.signalKey === candidate.signal.signalKey) {
				context.addIssue({
					code: "custom",
					message: "Covered route context cannot include its broad error owner",
					path: ["coveredRouteSignals", index, "signalKey"],
				});
			}
			if (routeKeys.has(route.signalKey)) {
				context.addIssue({
					code: "custom",
					message: "Covered route context cannot repeat a route signal",
					path: ["coveredRouteSignals", index, "signalKey"],
				});
			}
			routeKeys.add(route.signalKey);
		}
	});

const frozenInvestigationPlanSchema = z
	.object({
		asOf: z.string().datetime({ offset: true }),
		candidates: z.array(plannedCandidateSchema).max(MAX_MANUAL_CANDIDATES),
		emptyStatus: emptyPlanStatusSchema.optional(),
		reason: frozenPlanReasonSchema,
	})
	.strict()
	.superRefine((plan, context) => {
		const keys = plan.candidates.map((candidate) => candidate.signal.signalKey);
		if (new Set(keys).size !== keys.length) {
			context.addIssue({
				code: "custom",
				message: "A run candidate plan cannot repeat a signal",
				path: ["candidates"],
			});
		}
		if ((plan.candidates.length === 0) !== Boolean(plan.emptyStatus)) {
			context.addIssue({
				code: "custom",
				message:
					"A run candidate plan must contain candidates or one empty status",
				path: ["candidates"],
			});
		}
		const selectedSignalKeys = new Set(keys);
		for (const [candidateIndex, candidate] of plan.candidates.entries()) {
			for (const [routeIndex, route] of (
				candidate.coveredRouteSignals ?? []
			).entries()) {
				if (selectedSignalKeys.has(route.signalKey)) {
					context.addIssue({
						code: "custom",
						message:
							"Covered route context cannot include another selected candidate",
						path: [
							"candidates",
							candidateIndex,
							"coveredRouteSignals",
							routeIndex,
							"signalKey",
						],
					});
				}
			}
		}
	});

export type PlannedInvestigationCandidate = z.infer<
	typeof plannedCandidateSchema
>;
export type FrozenInvestigationPlan = z.infer<
	typeof frozenInvestigationPlanSchema
>;

export function parseFrozenInvestigationPlan(
	value: unknown,
	expectedReason?: CoveragePortfolioReason
): FrozenInvestigationPlan {
	const plan = frozenInvestigationPlanSchema.parse(value);
	if (expectedReason && plan.reason !== expectedReason) {
		throw new Error("Frozen candidate plan reason does not match its run");
	}
	const reason = expectedReason ?? plan.reason;
	if (plan.candidates.length > coveragePortfolioLimit(reason)) {
		throw new Error(
			`Frozen ${reason} candidate plan exceeds its portfolio limit`
		);
	}
	return plan;
}

export async function loadInsightRunCandidatePlan(
	identity: InsightRunIdentity,
	reason: CoveragePortfolioReason
): Promise<FrozenInvestigationPlan | null> {
	const [item] = await db
		.select({ plan: insightRunItems.candidatePlan })
		.from(insightRunItems)
		.where(runIdentityCondition(identity))
		.limit(1);
	if (!item || item.plan === null || item.plan === undefined) {
		return null;
	}
	return parseFrozenInvestigationPlan(item.plan, reason);
}

/**
 * The first worker freezes a small deterministic portfolio. Retries load this
 * exact snapshot so a changing warehouse cannot replace unfinished work with a
 * different candidate halfway through a run.
 */
export function freezeInsightRunCandidatePlan(
	identity: InsightRunIdentity,
	reason: CoveragePortfolioReason,
	proposed: Omit<FrozenInvestigationPlan, "reason">
): Promise<FrozenInvestigationPlan> {
	const parsedProposed = parseFrozenInvestigationPlan(
		{ ...proposed, reason },
		reason
	);
	return db.transaction(async (tx) => {
		const [item] = await tx
			.select({ plan: insightRunItems.candidatePlan })
			.from(insightRunItems)
			.where(runIdentityCondition(identity))
			.limit(1)
			.for("update");
		if (!item) {
			throw new Error("Insight run item not found while freezing candidates");
		}
		if (item.plan !== null && item.plan !== undefined) {
			return parseFrozenInvestigationPlan(item.plan, reason);
		}
		await tx
			.update(insightRunItems)
			.set({
				candidatePlan: parsedProposed,
				updatedAt: new Date(),
			})
			.where(runIdentityCondition(identity));
		return parsedProposed;
	});
}
