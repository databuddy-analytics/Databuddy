import { db } from "@databuddy/db";
import { insightRunItems } from "@databuddy/db/schema";
import { investigationSignalSchema } from "@databuddy/shared/insights";
import { z } from "zod";
import {
	coveragePortfolioLimit,
	type CoveragePortfolioReason,
} from "./coverage-planner";
import {
	type InsightRunIdentity,
	runIdentityCondition,
} from "./effects";

const frozenPlanReasonSchema = z.enum(["manual", "scheduled"]);
const emptyPlanStatusSchema = z.enum(["deferred", "no_signals"]);

const measurementCandidateSchema = z.discriminatedUnion("kind", [
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
]);

const plannedCandidateSchema = z
	.object({
		evidence: z.array(z.string().max(500)).max(20),
		measurementCandidate: measurementCandidateSchema.optional(),
		signal: investigationSignalSchema,
	})
	.strict();

const frozenInvestigationPlanSchema = z
	.object({
		asOf: z.string().datetime({ offset: true }),
		candidates: z.array(plannedCandidateSchema).max(3),
		/** Optional only to parse plans written before this field was introduced. */
		emptyStatus: emptyPlanStatusSchema.optional(),
		/** Optional only to parse plans written before this field was introduced. */
		reason: frozenPlanReasonSchema.optional(),
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
		if (plan.candidates.length > 0 && plan.emptyStatus) {
			context.addIssue({
				code: "custom",
				message: "Only an empty candidate plan may have an empty status",
				path: ["emptyStatus"],
			});
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
	if (expectedReason && plan.reason && plan.reason !== expectedReason) {
		throw new Error("Frozen candidate plan reason does not match its run");
	}
	const reason = expectedReason ?? plan.reason;
	if (reason && plan.candidates.length > coveragePortfolioLimit(reason)) {
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
	if (!item?.plan) {
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
	proposed: FrozenInvestigationPlan
): Promise<FrozenInvestigationPlan> {
	const parsedProposed = parseFrozenInvestigationPlan(proposed, reason);
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
		if (item.plan) {
			return parseFrozenInvestigationPlan(item.plan, reason);
		}
		await tx
			.update(insightRunItems)
			.set({
				candidatePlan: parsedProposed,
				candidatePlanAsOf: new Date(parsedProposed.asOf),
				updatedAt: new Date(),
			})
			.where(runIdentityCondition(identity));
		return parsedProposed;
	});
}
