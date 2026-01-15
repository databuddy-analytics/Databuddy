import { alarms, and, desc, eq, or } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { randomUUIDv7 } from "bun";
import type { SQL } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../orpc";

type SessionWithOrg = { activeOrganizationId?: string | null };

const notificationChannelSchema = z.enum([
	"slack",
	"discord",
	"email",
	"webhook",
]);
const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

const createAlarmSchema = z.object({
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	websiteId: z.string().optional(),
	enabled: z.boolean().optional().default(true),
	notificationChannels: z.array(notificationChannelSchema).default([]),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional().default([]),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: z.record(z.string(), z.string()).optional().default({}),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()).optional().default({}),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional().nullable(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).optional(),
	slackWebhookUrl: z.string().url().optional().nullable(),
	discordWebhookUrl: z.string().url().optional().nullable(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional().nullable(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

export const alarmsRouter = {
	list: protectedProcedure
		.input(
			z
				.object({
					websiteId: z.string().optional(),
				})
				.optional()
		)
		.handler(({ context, input }) => {
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			const conditions: SQL[] = [];

			// User can see their own alarms or organization alarms
			if (organizationId) {
				conditions.push(
					or(
						eq(alarms.userId, userId),
						eq(alarms.organizationId, organizationId)
					)
				);
			} else {
				conditions.push(eq(alarms.userId, userId));
			}

			// Filter by website if provided
			if (input?.websiteId) {
				conditions.push(eq(alarms.websiteId, input.websiteId));
			}

			return context.db
				.select()
				.from(alarms)
				.where(and(...conditions))
				.orderBy(desc(alarms.createdAt));
		}),

	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			const [alarm] = await context.db
				.select()
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						or(
							eq(alarms.userId, userId),
							organizationId
								? eq(alarms.organizationId, organizationId)
								: undefined
						)
					)
				)
				.limit(1);

			if (!alarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			return alarm;
		}),

	create: protectedProcedure
		.input(createAlarmSchema)
		.handler(async ({ context, input }) => {
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			const [newAlarm] = await context.db
				.insert(alarms)
				.values({
					id: randomUUIDv7(),
					userId,
					organizationId,
					websiteId: input.websiteId,
					name: input.name,
					description: input.description,
					enabled: input.enabled,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl,
					discordWebhookUrl: input.discordWebhookUrl,
					emailAddresses: input.emailAddresses,
					webhookUrl: input.webhookUrl,
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
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			// Check if alarm exists and user has access
			const [existingAlarm] = await context.db
				.select()
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						or(
							eq(alarms.userId, userId),
							organizationId
								? eq(alarms.organizationId, organizationId)
								: undefined
						)
					)
				)
				.limit(1);

			if (!existingAlarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const { id, ...updates } = input;
			const [updatedAlarm] = await context.db
				.update(alarms)
				.set({ ...updates, updatedAt: new Date() })
				.where(eq(alarms.id, id))
				.returning();

			return updatedAlarm;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			// Check if alarm exists and user has access
			const [existingAlarm] = await context.db
				.select()
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						or(
							eq(alarms.userId, userId),
							organizationId
								? eq(alarms.organizationId, organizationId)
								: undefined
						)
					)
				)
				.limit(1);

			if (!existingAlarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			await context.db.delete(alarms).where(eq(alarms.id, input.id));

			return { success: true };
		}),

	test: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const userId = context.user.id;
			const organizationId = (context.session as SessionWithOrg)?.activeOrganizationId;

			// Get the alarm
			const [alarm] = await context.db
				.select()
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						or(
							eq(alarms.userId, userId),
							organizationId
								? eq(alarms.organizationId, organizationId)
								: undefined
						)
					)
				)
				.limit(1);

			if (!alarm) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const testPayload = {
				title: `Test Notification: ${alarm.name}`,
				message:
					"This is a test notification from Databuddy to verify your alarm configuration is working correctly.",
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					alarmName: alarm.name,
					triggerType: alarm.triggerType,
					testSentAt: new Date().toISOString(),
				},
			};

			const results: Array<{
				channel: string;
				success: boolean;
				error?: string;
			}> = [];

			// Send to Slack if configured
			if (
				alarm.notificationChannels?.includes("slack") &&
				alarm.slackWebhookUrl
			) {
				try {
					await sendSlackWebhook(alarm.slackWebhookUrl, testPayload);
					results.push({ channel: "slack", success: true });
				} catch (error) {
					results.push({
						channel: "slack",
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			// Send to Discord if configured
			if (
				alarm.notificationChannels?.includes("discord") &&
				alarm.discordWebhookUrl
			) {
				try {
					await sendDiscordWebhook(alarm.discordWebhookUrl, testPayload);
					results.push({ channel: "discord", success: true });
				} catch (error) {
					results.push({
						channel: "discord",
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			// Send to webhook if configured
			if (alarm.notificationChannels?.includes("webhook") && alarm.webhookUrl) {
				try {
					await sendWebhook(alarm.webhookUrl, testPayload, {
						headers: (alarm.webhookHeaders as Record<string, string>) || {},
					});
					results.push({ channel: "webhook", success: true });
				} catch (error) {
					results.push({
						channel: "webhook",
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			// Note: Email would require additional setup with email provider
			if (
				alarm.notificationChannels?.includes("email") &&
				alarm.emailAddresses?.length
			) {
				results.push({
					channel: "email",
					success: false,
					error: "Email notifications require additional configuration",
				});
			}

			return {
				alarmId: alarm.id,
				results,
				allSuccessful: results.every((r) => r.success),
			};
		}),
};
