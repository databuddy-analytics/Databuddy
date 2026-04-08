import {
	and,
	db,
	eq,
	inArray,
	insightUserFeedback,
	websites,
} from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import {
	fetchSocialReferrals,
	reshapeSocialReferrals,
	type SocialPlatformResult,
} from "../lib/social-referrals";
import { sessionProcedure } from "../orpc";

const RANGE_TO_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

const socialReferrerUrlSchema = z.object({
	referrerUrl: z.string(),
	host: z.string(),
	sessions: z.number(),
	bouncedSessions: z.number(),
	avgDurationSeconds: z.number(),
	pageviews: z.number(),
});

const socialPlatformSchema = z.object({
	host: z.string(),
	name: z.string(),
	sessions: z.number(),
	bouncedSessions: z.number(),
	avgDurationSeconds: z.number(),
	urls: z.array(socialReferrerUrlSchema),
});

function listOrgWebsites(organizationId: string) {
	return db
		.select({ id: websites.id, domain: websites.domain, name: websites.name })
		.from(websites)
		.where(eq(websites.organizationId, organizationId));
}

async function _fetchOrgSocialReferrals(
	organizationId: string,
	range: "7d" | "30d" | "90d",
	limit: number
): Promise<{ platforms: SocialPlatformResult[] }> {
	const rangeDays = RANGE_TO_DAYS[range];
	const orgWebsites = await listOrgWebsites(organizationId);
	if (orgWebsites.length === 0) {
		return { platforms: [] };
	}
	const websiteIds = orgWebsites.map((w) => w.id);
	const rows = await fetchSocialReferrals(websiteIds, rangeDays, 200);
	return { platforms: reshapeSocialReferrals(rows, limit) };
}

const fetchOrgSocialReferralsCached = cacheable(_fetchOrgSocialReferrals, {
	expireInSec: 300,
	prefix: "insights:orgSocialReferrals",
});

const voteSchema = z.enum(["up", "down"]);

export const insightsRouter = {
	orgSocialReferrals: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/orgSocialReferrals",
			tags: ["Insights"],
			summary: "Org-wide social referrals",
			description:
				"Returns session-attributed social referrals grouped by canonical platform across all websites in the active organization, with per-URL drill-down.",
		})
		.input(
			z.object({
				range: z.enum(["7d", "30d", "90d"]),
				limit: z.number().int().min(1).max(20).optional(),
			})
		)
		.output(
			z.object({
				platforms: z.array(socialPlatformSchema),
			})
		)
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}
			const limit = input.limit ?? 5;
			return await fetchOrgSocialReferralsCached(
				context.organizationId,
				input.range,
				limit
			);
		}),

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
