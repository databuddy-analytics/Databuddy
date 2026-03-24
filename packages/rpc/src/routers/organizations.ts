import { and, db, desc, eq, gt, invitation, organization } from "@databuddy/db";
import { getPendingInvitationsSchema } from "@databuddy/validation";
import { Autumn as autumn } from "autumn-js";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import { getBillingOwner } from "../utils/billing";

const updateAvatarSeedSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	seed: z.string().min(1, "Seed is required"),
});

const orgOutputSchema = z.record(z.string(), z.unknown());

export const organizationsRouter = {
	updateAvatarSeed: protectedProcedure
		.route({
			description:
				"Updates organization avatar seed. Requires org update permission.",
			method: "POST",
			path: "/organizations/updateAvatarSeed",
			summary: "Update avatar seed",
			tags: ["Organizations"],
		})
		.input(updateAvatarSeedSchema)
		.output(z.object({ organization: orgOutputSchema }))
		.handler(async ({ input, context }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw rpcError.notFound("Organization", input.organizationId);
			}

			const [updatedOrganization] = await db
				.update(organization)
				.set({ logo: input.seed })
				.where(eq(organization.id, input.organizationId))
				.returning();

			return { organization: updatedOrganization };
		}),

	getPendingInvitations: protectedProcedure
		.route({
			description: "Returns pending invitations for an organization.",
			method: "POST",
			path: "/organizations/getPendingInvitations",
			summary: "Get pending invitations",
			tags: ["Organizations"],
		})
		.input(getPendingInvitationsSchema)
		.output(z.array(orgOutputSchema))
		.handler(async ({ input, context }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const [org] = await db
				.select()
				.from(organization)
				.where(eq(organization.id, input.organizationId))
				.limit(1);

			if (!org) {
				throw rpcError.notFound("Organization", input.organizationId);
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
				throw rpcError.internal("Failed to fetch pending invitations");
			}
		}),

	getUserPendingInvitations: protectedProcedure
		.route({
			description: "Returns pending invitations for the current user.",
			method: "POST",
			path: "/organizations/getUserPendingInvitations",
			summary: "Get user pending invitations",
			tags: ["Organizations"],
		})
		.output(
			z.array(
				z.object({
					id: z.string(),
					email: z.string(),
					role: z.string().nullable(),
					status: z.string(),
					expiresAt: z.coerce.date(),
					createdAt: z.coerce.date(),
					organizationId: z.string(),
					organizationName: z.string().nullable(),
					organizationLogo: z.string().nullable(),
					inviterId: z.string(),
				})
			)
		)
		.handler(async ({ context }) => {
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

	getUsage: protectedProcedure
		.route({
			description: "Returns Autumn usage for current user/workspace.",
			method: "POST",
			path: "/organizations/getUsage",
			summary: "Get usage",
			tags: ["Organizations"],
		})
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context }) => {
			const { customerId, isOrganization, canUserUpgrade } =
				await getBillingOwner(context.user.id, context.organizationId);

			try {
				const checkResult = await autumn.check({
					customer_id: customerId,
					feature_id: "events",
				});

				const data = checkResult.data;

				if (!data) {
					throw rpcError.internal("Failed to retrieve usage data");
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
				logger.error({ error }, "Failed to check usage");
				throw rpcError.internal("Failed to retrieve usage data");
			}
		}),

	getBillingContext: publicProcedure
		.route({
			description:
				"Returns billing context for user/workspace/website. Priority: websiteId > user workspace > free tier.",
			method: "POST",
			path: "/organizations/getBillingContext",
			summary: "Get billing context",
			tags: ["Organizations"],
		})
		.input(
			z
				.object({
					websiteId: z.string().optional(),
				})
				.optional()
		)
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context, input }) => {
			const isDev = process.env.NODE_ENV !== "production";
			let customerId: string | null = null;
			let isOrganization = false;
			let canUserUpgrade = true;
			let activeOrgId: string | null | undefined;

			if (input?.websiteId) {
				const workspace = await withWorkspace(context, {
					websiteId: input.websiteId,
					permissions: ["read"],
					allowPublicAccess: true,
				});
				try {
					const billing = await getBillingOwner(
						workspace.user?.id ?? "",
						workspace.organizationId
					);
					customerId = billing.customerId;
					isOrganization = billing.isOrganization;
					canUserUpgrade = false;
				} catch (error) {
					logger.error(
						{ error, websiteId: input.websiteId },
						"Error fetching billing owner from website"
					);
					throw rpcError.internal("Failed to retrieve billing information");
				}
			} else if (context.user) {
				activeOrgId = context.organizationId;
				const userBilling = await getBillingOwner(
					context.user.id,
					context.organizationId
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
