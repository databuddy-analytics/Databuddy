import { and, eq, inArray, insightUserFeedback } from "@databuddy/db";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { sessionProcedure } from "../orpc";

const voteSchema = z.enum(["up", "down"]);

export const insightsRouter = {
	getVotes: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/getVotes",
			tags: ["Insights"],
			summary: "Get insight feedback votes",
			description:
				"Returns thumbs up/down votes for the given insight ids for the current user in the active organization.",
		})
		.input(
			z.object({
				insightIds: z.array(z.string().min(1)).max(200),
			})
		)
		.output(
			z.object({
				votes: z.record(z.string(), voteSchema),
			})
		)
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}
			if (input.insightIds.length === 0) {
				return { votes: {} };
			}

			const rows = await context.db
				.select({
					insightId: insightUserFeedback.insightId,
					vote: insightUserFeedback.vote,
				})
				.from(insightUserFeedback)
				.where(
					and(
						eq(insightUserFeedback.userId, context.user.id),
						eq(insightUserFeedback.organizationId, context.organizationId),
						inArray(insightUserFeedback.insightId, input.insightIds)
					)
				);

			const votes: Record<string, "up" | "down"> = {};
			for (const row of rows) {
				votes[row.insightId] = row.vote;
			}
			return { votes };
		}),

	setVote: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/setVote",
			tags: ["Insights"],
			summary: "Set or clear insight vote",
			description:
				"Sets thumbs up/down for an insight, or clears the vote when vote is null.",
		})
		.input(
			z.object({
				insightId: z.string().min(1).max(256),
				vote: voteSchema.nullable(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			if (input.vote === null) {
				await context.db
					.delete(insightUserFeedback)
					.where(
						and(
							eq(insightUserFeedback.userId, context.user.id),
							eq(insightUserFeedback.organizationId, context.organizationId),
							eq(insightUserFeedback.insightId, input.insightId)
						)
					);
				return { success: true as const };
			}

			const now = new Date();
			await context.db
				.insert(insightUserFeedback)
				.values({
					id: randomUUIDv7(),
					userId: context.user.id,
					organizationId: context.organizationId,
					insightId: input.insightId,
					vote: input.vote,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						insightUserFeedback.userId,
						insightUserFeedback.organizationId,
						insightUserFeedback.insightId,
					],
					set: {
						vote: input.vote,
						updatedAt: now,
					},
				});

			return { success: true as const };
		}),
};
