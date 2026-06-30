import {
	and,
	db,
	desc,
	eq,
	gt,
	lt,
	normalizeEmailNotificationSettings,
	or,
} from "@databuddy/db";
import { invitation, organization } from "@databuddy/db/schema";
import {
	clearExpiredInvitationsSchema,
	getPendingInvitationsSchema,
} from "@databuddy/validation";
import { z } from "zod";
import { rpcError } from "../errors";
import { getAutumn } from "../lib/autumn-client";
import { logger } from "../lib/logger";
import { setTrackProperties } from "../middleware/track-mutation";
import {
	protectedProcedure,
	publicProcedure,
	sessionProcedure,
	trackedProcedure,
} from "../orpc";
import {
	withPublicWorkspace,
	withWorkspace,
} from "../procedures/with-workspace";

const updateAvatarSeedSchema = z.object({
	organizationId: z.string().min(1, "Organization ID is required"),
	seed: z.string().min(1, "Seed is required"),
});

const orgOutputSchema = z.record(z.string(), z.unknown());

const emailAlertModeSchema = z.enum([
	"off",
	"critical_only",
	"warnings_and_critical",
]);
const trackingAlertBlockReasonSchema = z.enum([
	"origin_not_authorized",
	"origin_missing",
	"ip_not_authorized",
]);
const broadWildcardOriginRegex = /^\*\.?[^.]+$/;
const ignoredOriginSchema = z
	.string()
	.trim()
	.min(1)
	.max(255)
	.transform((value) => value.toLowerCase())
	.refine((value) => value !== "*" && !broadWildcardOriginRegex.test(value), {
		message: "Use a specific host or wildcard like *.example.com.",
	});

const emailNotificationSettingsSchema = z.object({
	anomalies: z.object({
		customEventEmails: z.boolean(),
		errorEmails: z.boolean(),
		trafficEmails: z.boolean(),
	}),
	billing: z.object({ usageWarnings: z.boolean() }),
	trackingHealth: z.object({
		cooldownMinutes: z
			.number()
			.int()
			.min(15)
			.max(7 * 24 * 60),
		ignoredOrigins: z.array(ignoredOriginSchema).max(100),
		ignoredReasons: z.array(trackingAlertBlockReasonSchema).max(10),
		mode: emailAlertModeSchema,
	}),
	uptime: z.object({
		downEmails: z.boolean(),
		recoveryEmails: z.boolean(),
	}),
});

export const organizationsRouter = {
	updateAvatarSeed: trackedProcedure
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

	getEmailNotificationSettings: protectedProcedure
		.route({
			description: "Returns email notification settings for an organization.",
			method: "POST",
			path: "/organizations/getEmailNotificationSettings",
			summary: "Get email notification settings",
			tags: ["Organizations"],
		})
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.output(emailNotificationSettingsSchema)
		.handler(async ({ input, context }) => {
			const organizationId = input.organizationId ?? context.organizationId;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const row = await db.query.organization.findFirst({
				where: { id: organizationId },
				columns: { emailNotifications: true },
			});

			if (!row) {
				throw rpcError.notFound("Organization", organizationId);
			}

			return normalizeEmailNotificationSettings(row.emailNotifications);
		}),

	updateEmailNotificationSettings: trackedProcedure
		.route({
			description:
				"Updates email notification settings for an organization. Requires org update permission.",
			method: "POST",
			path: "/organizations/updateEmailNotificationSettings",
			summary: "Update email notification settings",
			tags: ["Organizations"],
		})
		.input(
			z.object({
				organizationId: z.string().optional(),
				settings: emailNotificationSettingsSchema,
			})
		)
		.output(emailNotificationSettingsSchema)
		.handler(async ({ input, context }) => {
			const organizationId = input.organizationId ?? context.organizationId;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			setTrackProperties({
				tracking_health_mode: input.settings.trackingHealth.mode,
				ignored_origin_count:
					input.settings.trackingHealth.ignoredOrigins.length,
			});

			const settings = emailNotificationSettingsSchema.parse(input.settings);
			const [row] = await db
				.update(organization)
				.set({ emailNotifications: settings })
				.where(eq(organization.id, organizationId))
				.returning({ emailNotifications: organization.emailNotifications });

			if (!row) {
				throw rpcError.notFound("Organization", organizationId);
			}

			return normalizeEmailNotificationSettings(row.emailNotifications);
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
			} catch {
				throw rpcError.internal("Failed to fetch pending invitations");
			}
		}),

	getUserPendingInvitations: sessionProcedure
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

	clearExpiredInvitations: trackedProcedure
		.route({
			description:
				"Deletes expired and accepted invitations for an organization.",
			method: "POST",
			path: "/organizations/clearExpiredInvitations",
			summary: "Clear expired invitations",
			tags: ["Organizations"],
		})
		.input(clearExpiredInvitationsSchema)
		.output(z.object({ deleted: z.number() }))
		.handler(async ({ input, context }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const result = await db
				.delete(invitation)
				.where(
					and(
						eq(invitation.organizationId, input.organizationId),
						or(
							eq(invitation.status, "accepted"),
							eq(invitation.status, "canceled"),
							eq(invitation.status, "rejected"),
							and(
								eq(invitation.status, "pending"),
								lt(invitation.expiresAt, new Date())
							)
						)
					)
				)
				.returning({ id: invitation.id });

			return { deleted: result.length };
		}),

	getUsage: sessionProcedure
		.route({
			description: "Returns Autumn usage for current user/workspace.",
			method: "POST",
			path: "/organizations/getUsage",
			summary: "Get usage",
			tags: ["Organizations"],
		})
		.output(z.record(z.string(), z.unknown()))
		.handler(async ({ context }) => {
			const billing = await context.getBilling();
			const customerId = billing?.customerId ?? context.user.id;
			const isOrganization = billing?.isOrganization ?? false;
			const canUserUpgrade = billing?.canUserUpgrade ?? true;

			try {
				const response = await getAutumn().check({
					customerId,
					featureId: "events",
				});

				const b = response.balance;
				const unlimited = b?.unlimited ?? false;
				const used = b?.usage ?? 0;
				const granted = b?.granted ?? 0;
				const includedUsage = granted;
				const overageAllowed = b?.overageAllowed ?? false;
				const remaining = unlimited ? null : Math.max(0, b?.remaining ?? 0);

				return {
					used,
					limit: unlimited ? null : granted,
					unlimited,
					balance: b?.remaining ?? 0,
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
				await withPublicWorkspace(context, {
					websiteId: input.websiteId,
					permissions: ["read"],
				});
				const billing = await context.getBilling();
				if (billing) {
					customerId = billing.customerId;
					isOrganization = billing.isOrganization;
					canUserUpgrade = false;
				}
			} else if (context.user) {
				activeOrgId = context.organizationId;
				const billing = await context.getBilling();
				if (billing) {
					customerId = billing.customerId;
					isOrganization = billing.isOrganization;
					canUserUpgrade = billing.canUserUpgrade;
				}
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
				const customer = await getAutumn().customers.getOrCreate({
					customerId,
				});

				const subs = customer.subscriptions;
				const activeSub =
					subs.find((s) => s.status === "active" && s.addOn === false) ??
					subs.find((s) => s.status === "active");

				const planId = activeSub?.planId
					? String(activeSub.planId).toLowerCase()
					: "free";

				return {
					planId,
					isOrganization,
					canUserUpgrade,
					hasActiveSubscription: Boolean(activeSub),
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
