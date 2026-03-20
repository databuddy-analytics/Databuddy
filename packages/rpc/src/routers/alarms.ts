import { alarms, and, db, eq, member } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure, requireUserId } from "../orpc";
import { checkOrgPermission } from "../utils/auth";

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

const alarmOutputSchema = z.record(z.string(), z.unknown());

const createAlarmSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string().optional(),
	name: z.string().min(1).max(200),
	description: z.string().max(1000).optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(notificationChannelSchema).min(1),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	triggerType: triggerTypeSchema,
	triggerConditions: z.record(z.string(), z.unknown()).optional(),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(200).optional(),
	description: z.string().max(1000).optional(),
	enabled: z.boolean().optional(),
	websiteId: z.string().nullish(),
	notificationChannels: z.array(notificationChannelSchema).min(1).optional(),
	slackWebhookUrl: z.string().url().nullish(),
	discordWebhookUrl: z.string().url().nullish(),
	emailAddresses: z.array(z.string().email()).nullish(),
	webhookUrl: z.string().url().nullish(),
	webhookHeaders: z.record(z.string(), z.string()).nullish(),
	triggerType: triggerTypeSchema.optional(),
	triggerConditions: z.record(z.string(), z.unknown()).nullish(),
});

async function getAlarmAndAuthorize(
	alarmId: string,
	context: { headers: Headers }
) {
	const alarm = await db.query.alarms.findFirst({
		where: eq(alarms.id, alarmId),
	});

	if (!alarm) {
		throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
	}

	if (alarm.organizationId) {
		await checkOrgPermission(
			context,
			alarm.organizationId,
			"website",
			"read",
			"Missing workspace permissions."
		);
	}

	return alarm;
}

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			description:
				"Returns all alarms for the user or organization.",
			method: "POST",
			path: "/alarms/list",
			summary: "List alarms",
			tags: ["Alarms"],
		})
		.input(
			z
				.object({
					organizationId: z.string().optional(),
					websiteId: z.string().optional(),
					triggerType: triggerTypeSchema.optional(),
				})
				.default({})
		)
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			if (input.organizationId) {
				await checkOrgPermission(
					context,
					input.organizationId,
					"website",
					"read",
					"Missing workspace permissions."
				);

				const conditions = [
					eq(alarms.organizationId, input.organizationId),
				];
				if (input.websiteId) {
					conditions.push(eq(alarms.websiteId, input.websiteId));
				}
				if (input.triggerType) {
					conditions.push(
						eq(alarms.triggerType, input.triggerType)
					);
				}

				return await db.query.alarms.findMany({
					where: and(...conditions),
					orderBy: (table, { desc }) => [desc(table.createdAt)],
				});
			}

			const userId = requireUserId(context);
			const userMemberships = await db.query.member.findMany({
				where: eq(member.userId, userId),
				columns: { organizationId: true },
			});

			if (userMemberships.length === 0) {
				return [];
			}

			const { inArray } = await import("@databuddy/db");
			const orgIds = userMemberships.map((m) => m.organizationId);

			return await db.query.alarms.findMany({
				where: inArray(alarms.organizationId, orgIds),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
		}),

	get: protectedProcedure
		.route({
			description: "Returns a single alarm by ID.",
			method: "POST",
			path: "/alarms/get",
			summary: "Get alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			const alarm = await getAlarmAndAuthorize(input.id, context);
			return alarm;
		}),

	create: protectedProcedure
		.route({
			description: "Creates a new alarm with notification channels.",
			method: "POST",
			path: "/alarms/create",
			summary: "Create alarm",
			tags: ["Alarms"],
		})
		.input(createAlarmSchema)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			const userId = requireUserId(context);

			await checkOrgPermission(
				context,
				input.organizationId,
				"website",
				"update",
				"Missing workspace permissions."
			);

			const alarmId = randomUUIDv7();

			const [created] = await db
				.insert(alarms)
				.values({
					id: alarmId,
					userId,
					organizationId: input.organizationId,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled ?? true,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses ?? null,
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders ?? null,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions ?? null,
				})
				.returning();

			logger.info({ alarmId, name: input.name }, "Alarm created");
			return created;
		}),

	update: protectedProcedure
		.route({
			description: "Updates an existing alarm.",
			method: "POST",
			path: "/alarms/update",
			summary: "Update alarm",
			tags: ["Alarms"],
		})
		.input(updateAlarmSchema)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			const existing = await getAlarmAndAuthorize(input.id, context);

			if (existing.organizationId) {
				await checkOrgPermission(
					context,
					existing.organizationId,
					"website",
					"update",
					"Missing workspace permissions."
				);
			}

			const { id, ...updates } = input;

			const updateData: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (updates.name !== undefined) updateData.name = updates.name;
			if (updates.description !== undefined)
				updateData.description = updates.description;
			if (updates.enabled !== undefined) updateData.enabled = updates.enabled;
			if (updates.websiteId !== undefined)
				updateData.websiteId = updates.websiteId;
			if (updates.notificationChannels !== undefined)
				updateData.notificationChannels = updates.notificationChannels;
			if (updates.slackWebhookUrl !== undefined)
				updateData.slackWebhookUrl = updates.slackWebhookUrl;
			if (updates.discordWebhookUrl !== undefined)
				updateData.discordWebhookUrl = updates.discordWebhookUrl;
			if (updates.emailAddresses !== undefined)
				updateData.emailAddresses = updates.emailAddresses;
			if (updates.webhookUrl !== undefined)
				updateData.webhookUrl = updates.webhookUrl;
			if (updates.webhookHeaders !== undefined)
				updateData.webhookHeaders = updates.webhookHeaders;
			if (updates.triggerType !== undefined)
				updateData.triggerType = updates.triggerType;
			if (updates.triggerConditions !== undefined)
				updateData.triggerConditions = updates.triggerConditions;

			const [updated] = await db
				.update(alarms)
				.set(updateData)
				.where(eq(alarms.id, id))
				.returning();

			logger.info({ alarmId: id }, "Alarm updated");
			return updated;
		}),

	delete: protectedProcedure
		.route({
			description: "Deletes an alarm.",
			method: "POST",
			path: "/alarms/delete",
			summary: "Delete alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const existing = await getAlarmAndAuthorize(input.id, context);

			if (existing.organizationId) {
				await checkOrgPermission(
					context,
					existing.organizationId,
					"website",
					"update",
					"Missing workspace permissions."
				);
			}

			await db.delete(alarms).where(eq(alarms.id, input.id));

			logger.info({ alarmId: input.id }, "Alarm deleted");
			return { success: true };
		}),

	test: protectedProcedure
		.route({
			description:
				"Sends a test notification to all configured channels on an alarm.",
			method: "POST",
			path: "/alarms/test",
			summary: "Test alarm",
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
			const alarm = await getAlarmAndAuthorize(input.id, context);

			const channels = alarm.notificationChannels as string[];
			const results: Array<{
				channel: string;
				success: boolean;
				error?: string;
			}> = [];

			const testPayload = {
				title: `Test Alarm: ${alarm.name}`,
				message:
					"This is a test notification from Databuddy. Your alarm is configured correctly.",
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					alarmName: alarm.name,
					test: true,
				},
			};

			for (const channel of channels) {
				try {
					if (channel === "slack" && alarm.slackWebhookUrl) {
						await sendSlackWebhook(alarm.slackWebhookUrl, testPayload);
						results.push({ channel: "slack", success: true });
					} else if (channel === "discord" && alarm.discordWebhookUrl) {
						await sendDiscordWebhook(
							alarm.discordWebhookUrl,
							testPayload
						);
						results.push({ channel: "discord", success: true });
					} else if (channel === "webhook" && alarm.webhookUrl) {
						await sendWebhook(alarm.webhookUrl, testPayload, {
							headers: (alarm.webhookHeaders as Record<string, string>) ?? undefined,
						});
						results.push({ channel: "webhook", success: true });
					} else if (channel === "email") {
						results.push({
							channel: "email",
							success: false,
							error: "Email notifications are not yet configured",
						});
					} else {
						results.push({
							channel,
							success: false,
							error: `Channel ${channel} is not configured`,
						});
					}
				} catch (error) {
					results.push({
						channel,
						success: false,
						error:
							error instanceof Error ? error.message : "Unknown error",
					});
				}
			}

			const allSucceeded = results.every((r) => r.success);
			return { success: allSucceeded, results };
		}),
};
