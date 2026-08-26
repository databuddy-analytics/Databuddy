import { db } from "@databuddy/db";
import { insightRunItems } from "@databuddy/db/schema";
import { investigationSignalSchema } from "@databuddy/shared/insights";
import { z } from "zod";
import {
	coveragePortfolioLimit,
	type CoveragePortfolioReason,
} from "./coverage-planner";
import { type InsightRunIdentity, runIdentityCondition } from "./effects";

const frozenPlanReasonSchema = z.enum(["manual", "scheduled"]);
const emptyPlanStatusSchema = z.enum(["deferred", "no_signals"]);

const plannedCandidateSchema = z
	.object({
		evidence: z.array(z.string().max(500)).max(20),
		signal: investigationSignalSchema,
	})
	.strip();

const frozenInvestigationPlanSchema = z
	.object({
		asOf: z.string().datetime({ offset: true }),
		candidates: z.array(plannedCandidateSchema).max(5),
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
