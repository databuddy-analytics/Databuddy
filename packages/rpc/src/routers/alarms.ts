import { alarms, db, eq, isNull, or } from "@databuddy/db";
import { NotificationClient } from "@databuddy/notifications";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";

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

const alarmInputSchema = z.object({
	name: z.string().min(1).max(255),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	websiteId: z.string().optional(),
	notificationChannels: z.array(notificationChannelSchema),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string()).optional(),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.unknown()),
});

const alarmOutputSchema = z.object({
	id: z.string(),
	userId: z.string().nullable(),
	organizationId: z.string().nullable(),
	websiteId: z.string().nullable(),
	name: z.string(),
	description: z.string().nullable(),
	enabled: z.boolean(),
	notificationChannels: z.array(z.string()),
	slackWebhookUrl: z.string().nullable(),
	discordWebhookUrl: z.string().nullable(),
	emailAddresses: z.array(z.string()).nullable(),
	webhookUrl: z.string().nullable(),
	webhookHeaders: z.unknown().nullable(),
	triggerType: z.string(),
	triggerConditions: z.unknown(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

async function authorizeAlarmAccess(
	context: Context,
	alarmId: string
): Promise<{ userId: string | null; organizationId: string | null }> {
	const alarm = await db.query.alarms.findFirst({
		where: eq(alarms.id, alarmId),
		columns: {
			userId: true,
			organizationId: true,
		},
	});

	if (!alarm) {
		throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
	}

	const userId = context.user?.id;
	const hasAccess =
		(alarm.userId && alarm.userId === userId) ||
		(alarm.organizationId && context.user?.id);

	if (!hasAccess) {
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have access to this alarm",
		});
	}

	return alarm;
}

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			description: "List all alarms for the current user or organization",
			method: "POST",
			path: "/alarms/list",
			summary: "List alarms",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				organizationId: z.string().optional(),
			})
		)
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			const userId = context.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			const whereCondition = input.organizationId
				? eq(alarms.organizationId, input.organizationId)
				: or(eq(alarms.userId, userId), isNull(alarms.organizationId));

			const result = await db.select().from(alarms).where(whereCondition);
			return result;
		}),

	get: protectedProcedure
		.route({
			description: "Get a single alarm by ID",
			method: "POST",
			path: "/alarms/get",
			summary: "Get alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeAlarmAccess(context, input.id);

			const alarm = await db.query.alarms.findFirst({
				where: eq(alarms.id, input.id),
			});

			if (!alarm) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}

			return alarm;
		}),

	create: protectedProcedure
		.route({
			description: "Create a new alarm",
			method: "POST",
			path: "/alarms/create",
			summary: "Create alarm",
			tags: ["Alarms"],
		})
		.input(
			alarmInputSchema.extend({
				organizationId: z.string().optional(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = context.user?.id;
			if (!userId) {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication required",
				});
			}

			const alarmId = randomUUIDv7();
			const [newAlarm] = await db
				.insert(alarms)
				.values({
					id: alarmId,
					userId,
					organizationId: input.organizationId || null,
					websiteId: input.websiteId || null,
					name: input.name,
					description: input.description || null,
					enabled: input.enabled,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl || null,
					discordWebhookUrl: input.discordWebhookUrl || null,
					emailAddresses: input.emailAddresses || [],
					webhookUrl: input.webhookUrl || null,
					webhookHeaders: input.webhookHeaders || null,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions,
				})
				.returning();

			if (!newAlarm) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create alarm",
				});
			}

			return newAlarm;
		}),

	update: protectedProcedure
		.route({
			description: "Update an existing alarm",
			method: "POST",
			path: "/alarms/update",
			summary: "Update alarm",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				id: z.string(),
				data: alarmInputSchema.partial(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeAlarmAccess(context, input.id);

			const [updatedAlarm] = await db
				.update(alarms)
				.set({
					...input.data,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, input.id))
				.returning();

			if (!updatedAlarm) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}

			return updatedAlarm;
		}),

	delete: protectedProcedure
		.route({
			description: "Delete an alarm",
			method: "POST",
			path: "/alarms/delete",
			summary: "Delete alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await authorizeAlarmAccess(context, input.id);

			await db.delete(alarms).where(eq(alarms.id, input.id));

			return { success: true };
		}),

	test: protectedProcedure
		.route({
			description: "Send a test notification to configured channels",
			method: "POST",
			path: "/alarms/test",
			summary: "Test alarm notification",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(
			z.object({
				success: z.boolean(),
				results: z.array(
					z.object({
						channel: z.string(),
						success: z.boolean(),
						error: z.string().optional(),
					})
				),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeAlarmAccess(context, input.id);

			const alarm = await db.query.alarms.findFirst({
				where: eq(alarms.id, input.id),
			});

			if (!alarm) {
				throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
			}

			const notificationClient = new NotificationClient({});
			const results: Array<{
				channel: string;
				success: boolean;
				error?: string;
			}> = [];

			for (const channel of alarm.notificationChannels) {
				try {
					if (channel === "slack" && alarm.slackWebhookUrl) {
						await notificationClient.sendSlack({
							webhookUrl: alarm.slackWebhookUrl,
							payload: {
								title: "Test Notification",
								message: `This is a test notification from alarm: ${alarm.name}`,
							},
						});
						results.push({ channel, success: true });
					} else if (channel === "discord" && alarm.discordWebhookUrl) {
						await notificationClient.sendDiscord({
							webhookUrl: alarm.discordWebhookUrl,
							payload: {
								title: "Test Notification",
								message: `This is a test notification from alarm: ${alarm.name}`,
							},
						});
						results.push({ channel, success: true });
					} else if (channel === "email" && alarm.emailAddresses?.length) {
						await notificationClient.sendEmail({
							to: alarm.emailAddresses,
							subject: "Test Notification",
							payload: {
								title: "Test Notification",
								message: `This is a test notification from alarm: ${alarm.name}`,
							},
						});
						results.push({ channel, success: true });
					} else if (channel === "webhook" && alarm.webhookUrl) {
						await notificationClient.sendWebhook({
							url: alarm.webhookUrl,
							headers: (alarm.webhookHeaders as Record<string, string>) || {},
							payload: {
								title: "Test Notification",
								message: `This is a test notification from alarm: ${alarm.name}`,
								alarm: {
									id: alarm.id,
									name: alarm.name,
								},
							},
						});
						results.push({ channel, success: true });
					} else {
						results.push({
							channel,
							success: false,
							error: "Channel not configured",
						});
					}
				} catch (error) {
					results.push({
						channel,
						success: false,
						error: error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			const allSuccess = results.every((r) => r.success);
			return { success: allSuccess, results };
		}),
};
