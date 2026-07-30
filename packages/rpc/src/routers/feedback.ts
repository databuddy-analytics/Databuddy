import { and, desc, eq, sql, withTransaction } from "@databuddy/db";
import type { db as DbType } from "@databuddy/db";
import { feedback, feedbackRedemptions } from "@databuddy/db/schema";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { submitFeedback } from "@databuddy/services/feedback";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { setTrackProperties } from "../middleware/track-mutation";
import { sessionProcedure, trackedSessionProcedure } from "../orpc";
import {
	isDefinitiveAutumnBalanceFailure,
	updateAutumnBalance,
} from "../utils/autumn-balance";
import { getBillingCustomerId } from "../utils/billing";

const REWARD_TIERS = [
	{ creditsRequired: 50, rewardType: "events", rewardAmount: 1000 },
	{ creditsRequired: 100, rewardType: "events", rewardAmount: 2500 },
	{ creditsRequired: 200, rewardType: "events", rewardAmount: 5000 },
	{ creditsRequired: 500, rewardType: "events", rewardAmount: 15_000 },
	{ creditsRequired: 25, rewardType: "agent-credits", rewardAmount: 10 },
	{ creditsRequired: 75, rewardType: "agent-credits", rewardAmount: 35 },
	{ creditsRequired: 150, rewardType: "agent-credits", rewardAmount: 80 },
	{ creditsRequired: 400, rewardType: "agent-credits", rewardAmount: 250 },
] as const;

const categoryEnum = z.enum([
	"bug_report",
	"feature_request",
	"ux_improvement",
	"performance",
	"documentation",
	"other",
]);

const statusEnum = z.enum(["pending", "approved", "rejected"]);

const feedbackOutputSchema = z.object({
	id: z.string(),
	userId: z.string(),
	organizationId: z.string(),
	title: z.string(),
	description: z.string(),
	category: categoryEnum,
	status: statusEnum,
	creditsAwarded: z.number(),
	adminNotes: z.string().nullable(),
	reviewedBy: z.string().nullable(),
	reviewedAt: z.coerce.date().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const submitterFeedbackOutputSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string(),
	category: categoryEnum,
	status: statusEnum,
	creditsAwarded: z.number(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const computeCreditsBalance = async (
	db: typeof DbType,
	userId: string,
	organizationId: string
) => {
	const [earnedResult] = await db
		.select({
			total: sql<number>`coalesce(sum(${feedback.creditsAwarded}), 0)`,
		})
		.from(feedback)
		.where(
			and(
				eq(feedback.userId, userId),
				eq(feedback.organizationId, organizationId),
				eq(feedback.status, "approved")
			)
		);

	const [spentResult] = await db
		.select({
			total: sql<number>`coalesce(sum(${feedbackRedemptions.creditsSpent}), 0)`,
		})
		.from(feedbackRedemptions)
		.where(
			and(
				eq(feedbackRedemptions.userId, userId),
				eq(feedbackRedemptions.organizationId, organizationId)
			)
		);

	const totalEarned = Number(earnedResult?.total ?? 0);
	const totalSpent = Number(spentResult?.total ?? 0);

	return {
		totalEarned,
		totalSpent,
		available: totalEarned - totalSpent,
	};
};

export const feedbackRouter = {
	submit: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/feedback/submit",
			tags: ["Feedback"],
			summary: "Submit feedback",
			description: "Submit new feedback to earn credits when approved.",
		})
		.input(
			z.object({
				title: z.string().min(3).max(200),
				description: z.string().min(10).max(5000),
				category: categoryEnum,
			})
		)
		.output(feedbackOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ category: input.category });
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			const rl = await ratelimit(
				`feedback:submit:${context.user.id}:${context.organizationId}`,
				5,
				3600
			);
			if (!rl.success) {
				throw rpcError.rateLimited(rl.reset);
			}

			return await submitFeedback({
				userId: context.user.id,
				organizationId: context.organizationId,
				title: input.title,
				description: input.description,
				category: input.category,
				source: "dashboard",
				userEmail: context.user.email,
			});
		}),

	list: sessionProcedure
		.route({
			method: "POST",
			path: "/feedback/list",
			tags: ["Feedback"],
			summary: "List my feedback",
			description: "List current user's feedback submissions.",
		})
		.input(
			z
				.object({
					status: statusEnum.optional(),
				})
				.default({})
		)
		.output(z.array(submitterFeedbackOutputSchema))
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			const conditions = [
				eq(feedback.userId, context.user.id),
				eq(feedback.organizationId, context.organizationId),
			];

			if (input.status) {
				conditions.push(eq(feedback.status, input.status));
			}

			return await context.db
				.select({
					id: feedback.id,
					title: feedback.title,
					description: feedback.description,
					category: feedback.category,
					status: feedback.status,
					creditsAwarded: feedback.creditsAwarded,
					createdAt: feedback.createdAt,
					updatedAt: feedback.updatedAt,
				})
				.from(feedback)
				.where(and(...conditions))
				.orderBy(desc(feedback.createdAt));
		}),

	getCreditsBalance: sessionProcedure
		.route({
			method: "POST",
			path: "/feedback/getCreditsBalance",
			tags: ["Feedback"],
			summary: "Get credits balance",
			description: "Get current user's feedback credits balance.",
		})
		.output(
			z.object({
				totalEarned: z.number(),
				totalSpent: z.number(),
				available: z.number(),
			})
		)
		.handler(async ({ context }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			return await computeCreditsBalance(
				context.db,
				context.user.id,
				context.organizationId
			);
		}),

	redeemCredits: trackedSessionProcedure
		.route({
			method: "POST",
			path: "/feedback/redeemCredits",
			tags: ["Feedback"],
			summary: "Redeem credits",
			description: "Redeem feedback credits for event balance.",
		})
		.input(
			z.object({
				tierIndex: z
					.number()
					.int()
					.min(0)
					.max(REWARD_TIERS.length - 1),
			})
		)
		.output(
			z.object({
				success: z.literal(true),
				rewardType: z.string(),
				rewardAmount: z.number(),
				creditsSpent: z.number(),
				remainingCredits: z.number(),
			})
		)
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			const tier = REWARD_TIERS[input.tierIndex];
			const userId = context.user.id;
			const organizationId = context.organizationId;

			const redemptionId = randomUUIDv7();

			await withTransaction(async (tx) => {
				await tx.execute(
					sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feedback:${userId}:${organizationId}`}, 0))`
				);

				const balance = await computeCreditsBalance(tx, userId, organizationId);

				if (balance.available < tier.creditsRequired) {
					throw rpcError.badRequest(
						`Not enough credits. You have ${balance.available} but need ${tier.creditsRequired}.`
					);
				}

				await tx.insert(feedbackRedemptions).values({
					id: redemptionId,
					userId,
					organizationId,
					creditsSpent: tier.creditsRequired,
					rewardType: tier.rewardType,
					rewardAmount: tier.rewardAmount,
				});
			});

			const customerId = await getBillingCustomerId(userId, organizationId);
			const featureId =
				tier.rewardType === "agent-credits" ? "agent-credits" : "events";

			try {
				await updateAutumnBalance({
					amount: tier.rewardAmount,
					customerId,
					featureId,
					redemptionId,
				});
			} catch (error) {
				const definitiveFailure = isDefinitiveAutumnBalanceFailure(error);

				if (definitiveFailure) {
					await context.db
						.delete(feedbackRedemptions)
						.where(eq(feedbackRedemptions.id, redemptionId))
						.catch((deleteError) => {
							logger.error(
								{ deleteError, redemptionId, userId },
								"Failed to roll back redemption after definitive Autumn failure"
							);
						});
				}

				const errorMessage =
					error instanceof Error ? error.message : String(error);
				logger.error(
					{
						error: errorMessage,
						userId,
						customerId,
						tier,
						redemptionId,
						ambiguousAutumnUpdate: !definitiveFailure,
					},
					"Failed to update Autumn balance for credit redemption"
				);
				throw rpcError.internal(
					definitiveFailure
						? "Failed to add events to your balance. Please try again."
						: "Your redemption was recorded, but we could not confirm the balance update. Please contact support before retrying."
				);
			}

			const newBalance = await computeCreditsBalance(
				context.db,
				userId,
				organizationId
			);

			logger.info(
				{
					userId,
					creditsSpent: tier.creditsRequired,
					rewardType: tier.rewardType,
					rewardAmount: tier.rewardAmount,
					remainingCredits: newBalance.available,
				},
				"Credits redeemed successfully"
			);

			return {
				success: true as const,
				rewardType: tier.rewardType,
				rewardAmount: tier.rewardAmount,
				creditsSpent: tier.creditsRequired,
				remainingCredits: newBalance.available,
			};
		}),
};
