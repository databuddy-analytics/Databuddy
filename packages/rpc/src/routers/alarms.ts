import { alarms, and, desc, eq, isNull, or } from "@databuddy/db";
import {
	NotificationClient,
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";

const notificationChannelSchema = z.enum(["slack", "discord", "email", "webhook"]);
const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

const triggerConditionsSchema = z.object({
	threshold: z.number().optional(),
	comparison: z.enum(["gt", "lt", "eq", "gte", "lte"]).optional(),
	metric: z.string().optional(),
	goalId: z.string().optional(),
	customExpression: z.string().optional(),
}).passthrough();

const webhookHeadersSchema = z.record(z.string(), z.string());

const createAlarmSchema = z.object({
	websiteId: z.string().optional(),
	name: z.string().min(1).max(100),
	description: z.string().max(500).optional(),
	enabled: z.boolean().optional().default(true),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional().default([]),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: webhookHeadersSchema.optional().default({}),
	triggerType: triggerTypeSchema,
	triggerConditions: triggerConditionsSchema.optional().default({}),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().max(500).optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: webhookHeadersSchema.optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: triggerConditionsSchema.optional(),
});

/**
 * Authorize access to alarms - user must own the alarm or be part of the organization
 */
async function authorizeAlarmAccess(
	context: { user: { id: string }; session: { activeOrganizationId?: string | null } },
	alarm: { userId: string | null; organizationId: string | null }
): Promise<boolean> {
	const userId = context.user.id;
	const activeOrgId = context.session?.activeOrganizationId;

	// User owns the alarm directly
	if (alarm.userId === userId) {
		return true;
	}

	// User is part of the organization that owns the alarm
	if (alarm.organizationId && alarm.organizationId === activeOrgId) {
		return true;
	}

	return false;
}

export const alarmsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				websiteId: z.string().optional(),
			}).optional()
		)
		.handler(async ({ context, input }) => {
			const userId = context.user.id;
			const activeOrgId = context.session?.activeOrganizationId;

			const conditions = [
				// User's personal alarms
				eq(alarms.userId, userId),
			];

			// Include organization alarms if user has an active organization
			if (activeOrgId) {
				conditions.push(eq(alarms.organizationId, activeOrgId));
			}

			let query = context.db
				.select()
				.from(alarms)
				.where(or(...conditions))
				.orderBy(desc(alarms.createdAt));

			// Filter by website if provided
			if (input?.websiteId) {
				query = context.db
					.select()
					.from(alarms)
					.where(
						and(
							or(...conditions),
							eq(alarms.websiteId, input.websiteId)
						)
					)
					.orderBy(desc(alarms.createdAt));
			}

			return query;
		}),

	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const [alarm] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!alarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const hasAccess = await authorizeAlarmAccess(context, alarm);
			if (!hasAccess) {
				throw errors.FORBIDDEN({
					message: "You don't have access to this alarm",
				});
			}

			return alarm;
		}),

	create: protectedProcedure
		.input(createAlarmSchema)
		.handler(async ({ context, input, errors }) => {
			const userId = context.user.id;
			const activeOrgId = context.session?.activeOrganizationId;

			// Validate channel-specific URLs
			if (input.notificationChannels.includes("slack") && !input.slackWebhookUrl) {
				throw errors.BAD_REQUEST({
					message: "Slack webhook URL is required when Slack channel is selected",
				});
			}

			if (input.notificationChannels.includes("discord") && !input.discordWebhookUrl) {
				throw errors.BAD_REQUEST({
					message: "Discord webhook URL is required when Discord channel is selected",
				});
			}

			if (input.notificationChannels.includes("email") && (!input.emailAddresses || input.emailAddresses.length === 0)) {
				throw errors.BAD_REQUEST({
					message: "At least one email address is required when Email channel is selected",
				});
			}

			if (input.notificationChannels.includes("webhook") && !input.webhookUrl) {
				throw errors.BAD_REQUEST({
					message: "Webhook URL is required when Webhook channel is selected",
				});
			}

			const [newAlarm] = await context.db
				.insert(alarms)
				.values({
					id: randomUUIDv7(),
					userId: activeOrgId ? null : userId,
					organizationId: activeOrgId ?? null,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses,
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions,
				})
				.returning();

			return newAlarm;
		}),

	update: protectedProcedure
		.input(updateAlarmSchema)
		.handler(async ({ context, input, errors }) => {
			const [existingAlarm] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!existingAlarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const hasAccess = await authorizeAlarmAccess(context, existingAlarm);
			if (!hasAccess) {
				throw errors.FORBIDDEN({
					message: "You don't have access to this alarm",
				});
			}

			// Merge existing channels with update
			const channels = input.notificationChannels ?? existingAlarm.notificationChannels;

			// Validate channel-specific URLs with merged data
			const slackUrl = input.slackWebhookUrl !== undefined ? input.slackWebhookUrl : existingAlarm.slackWebhookUrl;
			const discordUrl = input.discordWebhookUrl !== undefined ? input.discordWebhookUrl : existingAlarm.discordWebhookUrl;
			const emails = input.emailAddresses ?? existingAlarm.emailAddresses;
			const webhookUrl = input.webhookUrl !== undefined ? input.webhookUrl : existingAlarm.webhookUrl;

			if (channels.includes("slack") && !slackUrl) {
				throw errors.BAD_REQUEST({
					message: "Slack webhook URL is required when Slack channel is selected",
				});
			}

			if (channels.includes("discord") && !discordUrl) {
				throw errors.BAD_REQUEST({
					message: "Discord webhook URL is required when Discord channel is selected",
				});
			}

			if (channels.includes("email") && (!emails || emails.length === 0)) {
				throw errors.BAD_REQUEST({
					message: "At least one email address is required when Email channel is selected",
				});
			}

			if (channels.includes("webhook") && !webhookUrl) {
				throw errors.BAD_REQUEST({
					message: "Webhook URL is required when Webhook channel is selected",
				});
			}

			const { id, ...updates } = input;
			const [updatedAlarm] = await context.db
				.update(alarms)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, id))
				.returning();

			return updatedAlarm;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const [existingAlarm] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!existingAlarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const hasAccess = await authorizeAlarmAccess(context, existingAlarm);
			if (!hasAccess) {
				throw errors.FORBIDDEN({
					message: "You don't have access to this alarm",
				});
			}

			await context.db.delete(alarms).where(eq(alarms.id, input.id));

			return { success: true };
		}),

	test: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const [alarm] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!alarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const hasAccess = await authorizeAlarmAccess(context, alarm);
			if (!hasAccess) {
				throw errors.FORBIDDEN({
					message: "You don't have access to this alarm",
				});
			}

			const testPayload = {
				title: `🔔 Test Alert: ${alarm.name}`,
				message: "This is a test notification from Databuddy Alarms. If you're seeing this, your alarm is configured correctly!",
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					alarmName: alarm.name,
					isTest: true,
					timestamp: new Date().toISOString(),
				},
			};

			const results: Array<{ channel: string; success: boolean; error?: string }> = [];

			for (const channel of alarm.notificationChannels) {
				try {
					switch (channel) {
						case "slack":
							if (alarm.slackWebhookUrl) {
								const slackResult = await sendSlackWebhook(
									alarm.slackWebhookUrl,
									testPayload
								);
								results.push({
									channel: "slack",
									success: slackResult.success,
									error: slackResult.error,
								});
							}
							break;

						case "discord":
							if (alarm.discordWebhookUrl) {
								const discordResult = await sendDiscordWebhook(
									alarm.discordWebhookUrl,
									testPayload
								);
								results.push({
									channel: "discord",
									success: discordResult.success,
									error: discordResult.error,
								});
							}
							break;

						case "email":
							// Email sending would require email service configuration
							// For now, we'll mark it as successful if emails are configured
							if (alarm.emailAddresses && alarm.emailAddresses.length > 0) {
								results.push({
									channel: "email",
									success: true,
									error: "Email notifications will be sent when email service is configured",
								});
							}
							break;

						case "webhook":
							if (alarm.webhookUrl) {
								const webhookResult = await sendWebhook(
									alarm.webhookUrl,
									testPayload,
									{
										headers: (alarm.webhookHeaders as Record<string, string>) ?? {},
									}
								);
								results.push({
									channel: "webhook",
									success: webhookResult.success,
									error: webhookResult.error,
								});
							}
							break;
					}
				} catch (error) {
					results.push({
						channel,
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			const allSuccessful = results.every((r) => r.success);
			const someSuccessful = results.some((r) => r.success);

			return {
				success: allSuccessful,
				partial: !allSuccessful && someSuccessful,
				results,
			};
		}),
};
