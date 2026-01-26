import { websitesApi } from "@databuddy/auth";
import {
	and,
	db,
	desc,
	eq,
	gt,
	invitation,
	member,
	organization,
	websites,
} from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { getPendingInvitationsSchema } from "@databuddy/validation";
import { ORPCError } from "@orpc/server";
import { Autumn as autumn } from "autumn-js";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";

/**
 * Gets the billing owner ID for the current context.
 * If in an organization, returns the org owner's ID.
 * Otherwise, returns the current user's ID.
 */
async function getBillingOwnerId(
	userId: string,
	activeOrganizationId: string | null | undefined
): Promise<{
	customerId: string;
	isOrganization: boolean;
	canUserUpgrade: boolean;
}> {
	let customerId = userId;
	let isOrganization = false;
	let canUserUpgrade = true;

	// If user has an active organization, get the org owner's billing
	if (activeOrganizationId) {
		const [orgOwner] = await db
			.select({ ownerId: member.userId })
			.from(member)
			.where(
				and(
					eq(member.organizationId, activeOrganizationId),
					eq(member.role, "owner")
				)
			)
			.limit(1);

		if (orgOwner) {
			customerId = orgOwner.ownerId;
			isOrganization = true;
			// User can only upgrade if they are the org owner
			canUserUpgrade = orgOwner.ownerId === userId;
		}
	}

	return { customerId, isOrganization, canUserUpgrade };
}

/**
 * Gets the billing owner ID for a specific website (workspace owner).
 */
async function getBillingOwnerFromWebsite(websiteId: string): Promise<{
	customerId: string | null;
	isOrganization: boolean;
}> {
	const [website] = await db
		.select({
			organizationId: websites.organizationId,
		})
		.from(websites)
		.where(eq(websites.id, websiteId))
		.limit(1);

	if (!website?.organizationId) {
		return { customerId: null, isOrganization: false };
	}

	const [orgOwner] = await db
		.select({ ownerId: member.userId })
		.from(member)
		.where(
			and(
				eq(member.organizationId, website.organizationId),
				eq(member.role, "owner")
			)
		)
		.limit(1);

	return {
		customerId: orgOwner?.ownerId ?? null,
		isOrganization: true,
	};
}

const updateAvatarSeedSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	seed: z.string().min(1, "Seed is required"),
});

export const organizationsRouter = {
	updateAvatarSeed: protectedProcedure
		.input(updateAvatarSeedSchema)
		.handler(async ({ input, context }) => {
			const { success } = await websitesApi.hasPermission({
				headers: context.headers,
				body: { permissions: { organization: ["update"] } },
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message: "You do not have permission to update this organization.",
				});
			}

			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Organization not found.",
				});
			}

			const [updatedOrganization] = await db
				.update(organization)
				.set({ logo: input.seed })
				.where(eq(organization.id, input.organizationId))
				.returning();

			return { organization: updatedOrganization };
		}),

	getPendingInvitations: protectedProcedure
		.input(getPendingInvitationsSchema)
		.handler(async ({ input, context }) => {
			const { success } = await websitesApi.hasPermission({
				headers: context.headers,
				body: { permissions: { organization: ["read"] } },
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You do not have permission to view invitations for this organization.",
				});
			}

			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw new ORPCError("NOT_FOUND", {
					message: "Organization not found.",
				});
			}

			try {
				const conditions = [
					eq(invitation.organizationId, input.organizationId),
				];

				if (!input.includeExpired) {
					conditions.push(eq(invitation.status, "pending"));
				}

				const invitations = await db
					.select({
						id: invitation.id,
						email: invitation.email,
						role: invitation.role,
						status: invitation.status,
						expiresAt: invitation.expiresAt,
						inviterId: invitation.inviterId,
					})
					.from(invitation)
					.where(and(...conditions))
					.orderBy(desc(invitation.expiresAt));

				return invitations;
			} catch (error) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to fetch pending invitations",
					cause: error,
				});
			}
		}),

	getUserPendingInvitations: protectedProcedure.handler(async ({ context }) => {
		const pendingInvitations = await db
			.select({
				id: invitation.id,
				email: invitation.email,
				role: invitation.role,
				status: invitation.status,
				expiresAt: invitation.expiresAt,
				createdAt: invitation.createdAt,
				organizationId: invitation.organizationId,
				organizationName: organization.name,
				organizationLogo: organization.logo,
				inviterId: invitation.inviterId,
			})
			.from(invitation)
			.innerJoin(organization, eq(invitation.organizationId, organization.id))
			.where(
				and(
					eq(invitation.email, context.user.email),
					eq(invitation.status, "pending"),
					gt(invitation.expiresAt, new Date())
				)
			)
			.orderBy(desc(invitation.createdAt));

		return pendingInvitations;
	}),

	getUsage: protectedProcedure.handler(async ({ context }) => {
		const activeOrgId = (
			context.session as { activeOrganizationId?: string | null }
		)?.activeOrganizationId;
		const { customerId, isOrganization, canUserUpgrade } =
			await getBillingOwnerId(context.user.id, activeOrgId);

		try {
			const checkResult = await autumn.check({
				customer_id: customerId,
				feature_id: "events",
			});

			const data = checkResult.data;

			if (!data) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to retrieve usage data",
				});
			}
			const used = data.usage ?? 0;
			const usageLimit = data.usage_limit ?? 0;
			const unlimited = data.unlimited ?? false;
			const balance = data.balance ?? 0;
			const includedUsage = data.included_usage ?? 0;
			const overageAllowed = data.overage_allowed ?? false;

			const remaining = unlimited ? null : Math.max(0, usageLimit - used);

			return {
				used,
				limit: unlimited ? null : usageLimit,
				unlimited,
				balance,
				remaining,
				includedUsage,
				overageAllowed,
				isOrganizationUsage: isOrganization,
				canUserUpgrade,
			};
		} catch (error) {
			console.error("Failed to check usage:", error);
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to retrieve usage data",
				cause: error,
			});
		}
	}),

	/**
	 * Get billing context for the current user/workspace/website.
	 * Returns the correct plan based on workspace ownership.
	 *
	 * Priority:
	 * 1. If websiteId is provided, use the workspace owner's plan
	 * 2. If user is authenticated, use their workspace plan
	 * 3. Otherwise, return free tier defaults
	 */
	getBillingContext: publicProcedure
		.input(
			z
				.object({
					websiteId: z.string().optional(),
				})
				.optional()
		)
		.handler(async ({ context, input }) => {
			const isDev = process.env.NODE_ENV !== "production";
			let customerId: string | null = null;
			let isOrganization = false;
			let canUserUpgrade = true;
			let activeOrgId: string | null | undefined;

			// If websiteId is provided, get billing owner from website
			if (input?.websiteId) {
				const websiteOwner = await getBillingOwnerFromWebsite(input.websiteId);
				customerId = websiteOwner.customerId;
				isOrganization = websiteOwner.isOrganization;
				// User can't upgrade if they're viewing someone else's website
				canUserUpgrade = false;
			}
			// If user is authenticated, use their context
			else if (context.user) {
				activeOrgId = (
					context.session as { activeOrganizationId?: string | null }
				)?.activeOrganizationId;
				const userBilling = await getBillingOwnerId(
					context.user.id,
					activeOrgId
				);
				customerId = userBilling.customerId;
				isOrganization = userBilling.isOrganization;
				canUserUpgrade = userBilling.canUserUpgrade;
			}

			const debugInfo = isDev
				? {
						_debug: {
							userId: context.user?.id ?? null,
							activeOrganizationId: activeOrgId ?? null,
							customerId,
							websiteId: input?.websiteId ?? null,
							sessionId: context.session?.id ?? null,
						},
					}
				: {};

			// No customer ID means we can't look up billing
			if (!customerId) {
				return {
					planId: "free",
					isOrganization: false,
					canUserUpgrade: false,
					hasActiveSubscription: false,
					...debugInfo,
				};
			}

			try {
				const customerResult = await autumn.customers.get(customerId);
				const customer = customerResult.data;

				if (!customer) {
					return {
						planId: "free",
						isOrganization,
						canUserUpgrade,
						hasActiveSubscription: false,
						...debugInfo,
					};
				}

				const activeProduct = customer.products?.find(
					(p) => p.status === "active"
				);

				// Normalize product ID to lowercase for consistency
				const planId = activeProduct?.id
					? String(activeProduct.id).toLowerCase()
					: "free";

				return {
					planId,
					isOrganization,
					canUserUpgrade,
					hasActiveSubscription: Boolean(activeProduct),
					...debugInfo,
				};
			} catch (error) {
				logger.error(
					{
						error,
						customerId,
						websiteId: input?.websiteId,
					},
					"Failed to get billing context"
				);
				return {
					planId: "free",
					isOrganization,
					canUserUpgrade,
					hasActiveSubscription: false,
					...debugInfo,
				};
			}
		}),
};
