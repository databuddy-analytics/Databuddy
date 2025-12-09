import { websitesApi } from "@databuddy/auth";
import {
	and,
	db,
	desc,
	eq,
	invitation,
	member,
	organization,
	session,
	user,
	websites,
} from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { getPendingInvitationsSchema } from "@databuddy/validation";
import { ORPCError } from "@orpc/server";
import { Autumn as autumn } from "autumn-js";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";
import { s3 } from "../utils/s3";

/**
 * Gets the billing owner ID for the current context.
 * If in an organization, returns the org owner's ID.
 * Otherwise, returns the current user's ID.
 */
async function getBillingOwnerId(userId: string): Promise<{
	customerId: string;
	isOrganization: boolean;
	canUserUpgrade: boolean;
}> {
	const [orgResult] = await db
		.select({
			ownerId: user.id,
			activeOrgId: session.activeOrganizationId,
		})
		.from(session)
		.innerJoin(organization, eq(session.activeOrganizationId, organization.id))
		.innerJoin(member, eq(organization.id, member.organizationId))
		.innerJoin(user, eq(member.userId, user.id))
		.where(and(eq(session.userId, userId), eq(member.role, "owner")))
		.limit(1);

	const customerId = orgResult?.ownerId || userId;
	const isOrganization = Boolean(orgResult?.activeOrgId);
	const canUserUpgrade = !isOrganization || orgResult?.ownerId === userId;

	return { customerId, isOrganization, canUserUpgrade };
}

/**
 * Gets the billing owner ID for a specific website.
 * If website belongs to an organization, returns the org owner's ID.
 * Otherwise, returns the website owner's ID.
 */
async function getBillingOwnerFromWebsite(websiteId: string): Promise<{
	customerId: string | null;
	isOrganization: boolean;
}> {
	const [website] = await db
		.select({
			userId: websites.userId,
			organizationId: websites.organizationId,
		})
		.from(websites)
		.where(eq(websites.id, websiteId))
		.limit(1);

	if (!website) {
		return { customerId: null, isOrganization: false };
	}

	// If website belongs to an organization, get the org owner
	if (website.organizationId) {
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

	// Otherwise, use the website owner
	return {
		customerId: website.userId,
		isOrganization: false,
	};
}

const deleteOrganizationLogoSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
});

const uploadOrganizationLogoSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	fileData: z.string().min(1, "File data is required"),
	fileName: z.string().min(1, "File name is required"),
	fileType: z.string().min(1, "File type is required"),
});

export const organizationsRouter = {
	uploadLogo: protectedProcedure
		.input(uploadOrganizationLogoSchema)
		.handler(async ({ input, context }) => {
			const { success } = await websitesApi.hasPermission({
				headers: context.headers,
				body: { permissions: { organization: ["manage_logo"] } },
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You do not have permission to manage this organization logo.",
				});
			}

			// Get organization
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
				// Delete old logo if it exists
				if (org.logo) {
					await s3.deleteOrganizationLogo(org.logo);
				}

				// Type check the input since it's extended
				if (
					typeof input.fileData !== "string" ||
					typeof input.fileName !== "string" ||
					typeof input.fileType !== "string"
				) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Invalid file data format",
					});
				}

				const base64Data = input.fileData.split(",")[1];
				if (!base64Data) {
					throw new ORPCError("BAD_REQUEST", {
						message: "Invalid file data format",
					});
				}
				const buffer = Buffer.from(base64Data, "base64");
				const file = new File([buffer], input.fileName, {
					type: input.fileType,
				});

				const logoUrl = await s3.uploadOrganizationLogo(
					input.organizationId,
					file
				);

				// Update organization with new logo URL
				const [updatedOrganization] = await db
					.update(organization)
					.set({ logo: logoUrl })
					.where(eq(organization.id, input.organizationId))
					.returning();

				return {
					organization: updatedOrganization,
					logoUrl,
				};
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to upload organization logo",
					cause: error,
				});
			}
		}),

	deleteLogo: protectedProcedure
		.input(deleteOrganizationLogoSchema)
		.handler(async ({ input, context }) => {
			const { success } = await websitesApi.hasPermission({
				headers: context.headers,
				body: { permissions: { organization: ["manage_logo"] } },
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"You do not have permission to manage this organization logo.",
				});
			}

			// Get organization
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
				// Delete logo if it exists
				if (org.logo) {
					await s3.deleteOrganizationLogo(org.logo);
				}

				// Remove logo URL from database
				const [updatedOrganization] = await db
					.update(organization)
					.set({ logo: null })
					.where(eq(organization.id, input.organizationId))
					.returning();

				return {
					organization: updatedOrganization,
					success: true,
				};
			} catch (error) {
				if (error instanceof ORPCError) {
					throw error;
				}
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to delete organization logo",
					cause: error,
				});
			}
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

	getUsage: protectedProcedure.handler(async ({ context }) => {
		const { customerId, isOrganization, canUserUpgrade } =
			await getBillingOwnerId(context.user.id);

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
	 * Get billing context for the current user/organization/website.
	 * Returns the correct plan based on ownership.
	 *
	 * Priority:
	 * 1. If websiteId is provided, use the website/org owner's plan
	 * 2. If user is authenticated, use their org/personal plan
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
			let customerId: string | null = null;
			let isOrganization = false;
			let canUserUpgrade = true;

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
				const userBilling = await getBillingOwnerId(context.user.id);
				customerId = userBilling.customerId;
				isOrganization = userBilling.isOrganization;
				canUserUpgrade = userBilling.canUserUpgrade;
			}

			// No customer ID means we can't look up billing
			if (!customerId) {
				return {
					planId: "free",
					isOrganization: false,
					canUserUpgrade: false,
					hasActiveSubscription: false,
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
				};
			}
		}),
};
