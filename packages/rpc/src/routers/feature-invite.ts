import { and, db, desc, eq, ne, withTransaction } from "@databuddy/db";
import { featureInvite, flags } from "@databuddy/db/schema";
import type { userRuleSchema } from "@databuddy/shared/flags";
import { invalidateFlagCache } from "@databuddy/shared/flags/utils";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { type Context, sessionProcedure } from "../orpc";
import { resolveFeatureAccess } from "../procedures/with-feature-access";

const MAX_LINKS_PER_FLAG = 5;

type UserRule = z.infer<typeof userRuleSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

function userLinksWhere(flagKey: string, userId: string) {
	return and(
		eq(featureInvite.flagKey, flagKey),
		eq(featureInvite.invitedById, userId),
		ne(featureInvite.status, "revoked")
	);
}

async function requireAccess(context: Context, flagKey: string): Promise<void> {
	const allowed = await resolveFeatureAccess(context, flagKey);
	if (!allowed) {
		throw rpcError.forbidden(
			"You need access to this feature to manage invite links"
		);
	}
}

async function syncEmailToFlagRules(
	flagKey: string,
	email: string
): Promise<void> {
	const normalizedEmail = email.toLowerCase();

	const matchingFlags = await db.query.flags.findMany({
		where: eq(flags.key, flagKey),
		columns: { id: true, rules: true, websiteId: true, organizationId: true },
		limit: 1000,
	});

	const updates: Array<{
		id: string;
		rules: UserRule[];
		websiteId: string | null;
		organizationId: string | null;
	}> = [];

	for (const flag of matchingFlags) {
		const rules = (flag.rules ?? []) as UserRule[];

		const emailRule = rules.find(
			(r) => r.type === "email" && r.operator === "in"
		);

		if (emailRule) {
			if (emailRule.values?.includes(normalizedEmail)) {
				continue;
			}
			emailRule.values = [...(emailRule.values ?? []), normalizedEmail];
		} else {
			rules.push({
				type: "email",
				operator: "in",
				values: [normalizedEmail],
				enabled: true,
				batch: true,
				batchValues: [normalizedEmail],
			});
		}

		updates.push({
			id: flag.id,
			rules,
			websiteId: flag.websiteId,
			organizationId: flag.organizationId,
		});
	}

	await Promise.all(
		updates.map(async ({ id, rules, websiteId, organizationId }) => {
			await db.update(flags).set({ rules }).where(eq(flags.id, id));
			await invalidateFlagCache(id, websiteId, organizationId, flagKey);
		})
	);
}

// ── Schemas ─────────────────────────────────────────────────────────

const flagKeyInput = { flagKey: z.string().min(1) } as const;

const linkOutputSchema = z.object({
	id: z.string(),
	flagKey: z.string(),
	token: z.string(),
	status: z.string(),
	invitedById: z.string(),
	redeemedById: z.string().nullable(),
	redeemedAt: z.union([z.date(), z.string()]).nullable(),
	createdAt: z.union([z.date(), z.string()]),
});

// ── Router ──────────────────────────────────────────────────────────

export const featureInviteRouter = {
	peekLink: sessionProcedure
		.route({
			description:
				"Returns the flag key and status of an invite link without redeeming it.",
			method: "POST",
			path: "/featureInvite/peekLink",
			summary: "Peek invite link",
			tags: ["Feature Invite"],
		})
		.input(z.object({ token: z.string().min(1) }))
		.output(
			z.object({
				flagKey: z.string(),
				status: z.string(),
			})
		)
		.handler(async ({ input }) => {
			const invite = await db.query.featureInvite.findFirst({
				where: eq(featureInvite.token, input.token),
				columns: { flagKey: true, status: true },
			});

			if (!invite) {
				throw rpcError.notFound("Invite link", input.token);
			}

			return { flagKey: invite.flagKey, status: invite.status };
		}),

	generateLinks: sessionProcedure
		.route({
			description:
				"Auto-generates invite links for a feature flag, up to 5 per user.",
			method: "POST",
			path: "/featureInvite/generateLinks",
			summary: "Generate invite links",
			tags: ["Feature Invite"],
		})
		.input(z.object(flagKeyInput))
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			const userId = context.user.id;
			await requireAccess(context as Context, input.flagKey);

			return withTransaction(async (tx) => {
				const existing = await tx.query.featureInvite.findMany({
					where: userLinksWhere(input.flagKey, userId),
					orderBy: [desc(featureInvite.createdAt)],
					limit: MAX_LINKS_PER_FLAG,
				});

				const toCreate = MAX_LINKS_PER_FLAG - existing.length;
				if (toCreate <= 0) {
					return existing;
				}

				const newLinks = Array.from({ length: toCreate }, () => ({
					id: randomUUIDv7(),
					flagKey: input.flagKey,
					token: randomUUIDv7(),
					status: "active" as const,
					invitedById: userId,
				}));

				await tx.insert(featureInvite).values(newLinks);

				return tx.query.featureInvite.findMany({
					where: userLinksWhere(input.flagKey, userId),
					orderBy: [desc(featureInvite.createdAt)],
					limit: MAX_LINKS_PER_FLAG,
				});
			});
		}),

	listLinks: sessionProcedure
		.route({
			description:
				"Lists all invite links created by the current user for a feature flag.",
			method: "POST",
			path: "/featureInvite/listLinks",
			summary: "List invite links",
			tags: ["Feature Invite"],
		})
		.input(z.object(flagKeyInput))
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			const userId = context.user.id;
			await requireAccess(context as Context, input.flagKey);

			return db.query.featureInvite.findMany({
				where: userLinksWhere(input.flagKey, userId),
				orderBy: [desc(featureInvite.createdAt)],
				limit: MAX_LINKS_PER_FLAG,
			});
		}),

	revokeLink: sessionProcedure
		.route({
			description:
				"Revokes an invite link. Only the creator can revoke their own links.",
			method: "POST",
			path: "/featureInvite/revokeLink",
			summary: "Revoke invite link",
			tags: ["Feature Invite"],
		})
		.input(z.object({ inviteId: z.string().min(1) }))
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			const invite = await db.query.featureInvite.findFirst({
				where: eq(featureInvite.id, input.inviteId),
			});

			if (!invite) {
				throw rpcError.notFound("Invite link", input.inviteId);
			}

			if (invite.invitedById !== context.user.id) {
				throw rpcError.forbidden("You can only revoke your own invite links");
			}

			if (invite.status === "revoked") {
				throw rpcError.badRequest("Link is already revoked");
			}

			const [updated] = await db
				.update(featureInvite)
				.set({ status: "revoked" })
				.where(eq(featureInvite.id, input.inviteId))
				.returning();

			return updated;
		}),

	redeemLink: sessionProcedure
		.route({
			description:
				"Redeems an invite link by token. Any authenticated user can redeem an active link.",
			method: "POST",
			path: "/featureInvite/redeemLink",
			summary: "Redeem invite link",
			tags: ["Feature Invite"],
		})
		.input(z.object({ token: z.string().min(1) }))
		.output(z.object({ flagKey: z.string() }))
		.handler(async ({ context, input }) => {
			const { id: userId, email: userEmail } = context.user;

			const result = await withTransaction(async (tx) => {
				const invite = await tx.query.featureInvite.findFirst({
					where: eq(featureInvite.token, input.token),
				});

				if (!invite) {
					throw rpcError.notFound("Invite link", input.token);
				}

				if (invite.status === "revoked") {
					throw rpcError.forbidden("This invite link has been revoked");
				}

				if (invite.status === "redeemed") {
					throw rpcError.badRequest(
						"This invite link has already been redeemed"
					);
				}

				const [updated] = await tx
					.update(featureInvite)
					.set({
						status: "redeemed",
						redeemedById: userId,
						redeemedAt: new Date(),
					})
					.where(eq(featureInvite.id, invite.id))
					.returning();

				return updated;
			});

			syncEmailToFlagRules(result.flagKey, userEmail).catch((error) => {
				logger.error(
					{ error, flagKey: result.flagKey, email: userEmail },
					"Failed to sync redeemed email to flag rules"
				);
			});

			return { flagKey: result.flagKey };
		}),

	getInviteCount: sessionProcedure
		.route({
			description:
				"Returns the number of active/redeemed invite links the current user has for a flag.",
			method: "POST",
			path: "/featureInvite/getInviteCount",
			summary: "Get invite count",
			tags: ["Feature Invite"],
		})
		.input(z.object(flagKeyInput))
		.output(
			z.object({
				used: z.number(),
				limit: z.number(),
				remaining: z.number(),
			})
		)
		.handler(async ({ context, input }) => {
			const userId = context.user.id;

			const links = await db.query.featureInvite.findMany({
				where: userLinksWhere(input.flagKey, userId),
				columns: { id: true },
				limit: MAX_LINKS_PER_FLAG,
			});

			const used = links.length;
			return {
				used,
				limit: MAX_LINKS_PER_FLAG,
				remaining: Math.max(0, MAX_LINKS_PER_FLAG - used),
			};
		}),

	checkAccess: sessionProcedure
		.route({
			description:
				"Checks whether the current user has access to a feature. Returns a boolean without throwing.",
			method: "POST",
			path: "/featureInvite/checkAccess",
			summary: "Check feature access",
			tags: ["Feature Invite"],
		})
		.input(z.object(flagKeyInput))
		.output(z.object({ hasAccess: z.boolean() }))
		.handler(async ({ context, input }) => {
			const hasAccess = await resolveFeatureAccess(
				context as Context,
				input.flagKey
			);
			return { hasAccess };
		}),
};
