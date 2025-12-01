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
} from "@databuddy/db";
import { getPendingInvitationsSchema } from "@databuddy/validation";
import { ORPCError } from "@orpc/server";
import { Autumn as autumn } from "autumn-js";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { s3 } from "../utils/s3";

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
		const [orgResult] = await db
			.select({
				ownerId: user.id,
				activeOrgId: session.activeOrganizationId,
			})
			.from(session)
			.innerJoin(
				organization,
				eq(session.activeOrganizationId, organization.id)
			)
			.innerJoin(member, eq(organization.id, member.organizationId))
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(eq(session.userId, context.user.id), eq(member.role, "owner")))
			.limit(1);

		// Determine customer ID: organization owner or current user
		const customerId = orgResult?.ownerId || context.user.id;

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

			const remaining = unlimited ? null : Math.max(0, usageLimit - used);

			return {
				used,
				limit: unlimited ? null : usageLimit,
				unlimited,
				balance,
				remaining,
				includedUsage,
				isOrganizationUsage: Boolean(orgResult?.activeOrgId),
				canUserUpgrade:
					!orgResult?.activeOrgId || orgResult.ownerId === context.user.id,
			};
		} catch (error) {
			console.error("Failed to check usage:", error);
			throw new ORPCError("INTERNAL_SERVER_ERROR", {
				message: "Failed to retrieve usage data",
				cause: error,
			});
		}
	}),
};
