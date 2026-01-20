import { alarms, and, desc, eq } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

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
	organizationId: z.string(),
	websiteId: z.string().optional(),
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

export const alarmsRouter = {
	list: publicProcedure
		.input(
			z.object({
				organizationId: z.string(),
				websiteId: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const conditions = [eq(alarms.organizationId, input.organizationId)];

			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "read");
				conditions.push(eq(alarms.websiteId, input.websiteId));
			}

			return context.db
				.select()
				.from(alarms)
				.where(and(...conditions))
				.orderBy(desc(alarms.createdAt));
		}),

	get: publicProcedure
		.input(z.object({ id: z.string(), organizationId: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const [alarm] = await context.db
				.select()
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						eq(alarms.organizationId, input.organizationId)
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
			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "update");
			}

			const [newAlarm] = await context.db
				.insert(alarms)
				.values({
					id: randomUUIDv7(),
					userId: context.user.id,
					organizationId: input.organizationId,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses ?? null,
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders ?? null,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions,
				})
				.returning();

			return newAlarm;
		}),

	update: protectedProcedure
		.input(updateAlarmSchema)
		.handler(async ({ context, input, errors }) => {
			const [existing] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!existing) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			if (existing.websiteId) {
				await authorizeWebsiteAccess(context, existing.websiteId, "update");
			}

			const { id, ...updateData } = input;

			const [updated] = await context.db
				.update(alarms)
				.set({
					...updateData,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, input.id))
				.returning();

			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input, errors }) => {
			const [existing] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, input.id))
				.limit(1);

			if (!existing) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			if (existing.websiteId) {
				await authorizeWebsiteAccess(context, existing.websiteId, "update");
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

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "read");
			}

			const testPayload = {
				title: `Test Alarm: ${alarm.name}`,
				message: `This is a test notification from your alarm "${alarm.name}". If you receive this, your alarm is configured correctly!`,
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					triggerType: alarm.triggerType,
					isTest: true,
				},
			};

			const results: Array<{
				channel: string;
				success: boolean;
				error?: string;
			}> = [];

			for (const channel of alarm.notificationChannels) {
				try {
					if (channel === "slack" && alarm.slackWebhookUrl) {
						const result = await sendSlackWebhook(
							alarm.slackWebhookUrl,
							testPayload
						);
						results.push({
							channel,
							success: result.success,
							error: result.error,
						});
					} else if (channel === "discord" && alarm.discordWebhookUrl) {
						const result = await sendDiscordWebhook(
							alarm.discordWebhookUrl,
							testPayload
						);
						results.push({
							channel,
							success: result.success,
							error: result.error,
						});
					} else if (channel === "webhook" && alarm.webhookUrl) {
						const result = await sendWebhook(alarm.webhookUrl, testPayload, {
							headers: alarm.webhookHeaders as
								| Record<string, string>
								| undefined,
						});
						results.push({
							channel,
							success: result.success,
							error: result.error,
						});
					} else if (channel === "email" && alarm.emailAddresses) {
						results.push({
							channel,
							success: true,
							message: "Email sending not implemented in test mode",
						});
					} else {
						results.push({
							channel,
							success: false,
							error: `Channel ${channel} not configured`,
						});
					}
				} catch (error) {
					results.push({
						channel,
						success: false,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}

			return { results };
		}),
};
