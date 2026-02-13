import {
	alarms,
	and,
	desc,
	eq,
	websites,
} from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendEmail,
	sendSlackWebhook,
	sendWebhook,
	type NotificationResult,
} from "@databuddy/notifications";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { checkOrgPermission } from "../utils/auth";

const alarmChannelSchema = z.enum(["slack", "discord", "email", "webhook"]);

const alarmOutputSchema = z.object({
	id: z.string(),
	organizationId: z.string(),
	userId: z.string().nullable(),
	websiteId: z.string().nullable(),
	name: z.string(),
	description: z.string().nullable(),
	enabled: z.boolean(),
	notificationChannels: z.array(alarmChannelSchema),
	slackWebhookUrl: z.string().nullable(),
	discordWebhookUrl: z.string().nullable(),
	emailAddresses: z.array(z.string()),
	webhookUrl: z.string().nullable(),
	webhookHeaders: z.record(z.string(), z.unknown()).nullable(),
	conditions: z.record(z.string(), z.unknown()).nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const notificationResultSchema = z.object({
	success: z.boolean(),
	channel: alarmChannelSchema,
	error: z.string().optional(),
	response: z.unknown().optional(),
});

const alarmInputSchema = z.object({
	organizationId: z.string(),
	websiteId: z.string().optional(),
	name: z.string().min(1).max(120),
	description: z.string().max(500).optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(alarmChannelSchema).optional(),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string(), z.string()).optional(),
	conditions: z.record(z.string(), z.unknown()).optional(),
});

async function assertWebsiteBelongsToOrg(
	context: Parameters<typeof checkOrgPermission>[0],
	organizationId: string,
	websiteId: string
) {
	const website = await context.db.query.websites.findFirst({
		where: eq(websites.id, websiteId),
		columns: { id: true, organizationId: true },
	});

	if (!website) {
		throw new ORPCError("NOT_FOUND", {
			message: "Website not found",
		});
	}

	if (website.organizationId !== organizationId) {
		throw new ORPCError("FORBIDDEN", {
			message: "Website does not belong to this workspace",
		});
	}
}

async function sendAlarmTest(
	alarm: z.infer<typeof alarmOutputSchema>
): Promise<NotificationResult[]> {
	const payload = {
		title: `Databuddy Alarm Test: ${alarm.name}`,
		message:
			"This is a test notification to confirm your alarm settings are working.",
		priority: "normal" as const,
		metadata: {
			alarmId: alarm.id,
			organizationId: alarm.organizationId,
		},
	};

	const results: NotificationResult[] = [];

	if (alarm.notificationChannels.includes("slack")) {
		if (!alarm.slackWebhookUrl) {
			results.push({
				success: false,
				channel: "slack",
				error: "Slack webhook URL not configured",
			});
		} else {
			results.push(await sendSlackWebhook(alarm.slackWebhookUrl, payload));
		}
	}

	if (alarm.notificationChannels.includes("discord")) {
		if (!alarm.discordWebhookUrl) {
			results.push({
				success: false,
				channel: "discord",
				error: "Discord webhook URL not configured",
			});
		} else {
			results.push(await sendDiscordWebhook(alarm.discordWebhookUrl, payload));
		}
	}

	if (alarm.notificationChannels.includes("webhook")) {
		if (!alarm.webhookUrl) {
			results.push({
				success: false,
				channel: "webhook",
				error: "Webhook URL not configured",
			});
		} else {
			results.push(
				await sendWebhook(alarm.webhookUrl, payload, {
					headers: (alarm.webhookHeaders ?? {}) as Record<string, string>,
					method: "POST",
				})
			);
		}
	}

	if (alarm.notificationChannels.includes("email")) {
		if (alarm.emailAddresses.length === 0) {
			results.push({
				success: false,
				channel: "email",
				error: "Email addresses not configured",
			});
		} else {
			const fromAddress =
				process.env.NOTIFICATIONS_EMAIL_FROM ?? "noreply@databuddy.cc";
			const resendApiKey = process.env.RESEND_API_KEY;

			const emailResult = await sendEmail(
				async (emailPayload) => {
					if (!resendApiKey) {
						throw new Error("RESEND_API_KEY not configured");
					}

					const response = await fetch("https://api.resend.com/emails", {
						method: "POST",
						headers: {
							Authorization: `Bearer ${resendApiKey}`,
							"Content-Type": "application/json",
						},
						body: JSON.stringify({
							from: fromAddress,
							...emailPayload,
						}),
					});

					if (!response.ok) {
						const errorText = await response
							.text()
							.catch(() => "Unable to read response");
						throw new Error(
							`Resend API error: ${response.status} ${response.statusText} - ${errorText.slice(0, 200)}`
						);
					}

					return response.json().catch(() => ({}));
				},
				{
					...payload,
					to: alarm.emailAddresses,
				},
				{ from: fromAddress }
			);

			results.push(emailResult);
		}
	}

	return results;
}

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/list",
			tags: ["Alarms"],
			summary: "List alarms",
			description: "Returns alarms for a workspace.",
		})
		.input(z.object({ organizationId: z.string() }))
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"read",
				"Missing workspace permissions."
			);

			return context.db
				.select()
				.from(alarms)
				.where(eq(alarms.organizationId, input.organizationId))
				.orderBy(desc(alarms.createdAt));
		}),

	get: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/get",
			tags: ["Alarms"],
			summary: "Get alarm",
			description: "Returns a single alarm by id.",
		})
		.input(z.object({ id: z.string(), organizationId: z.string() }))
		.output(alarmOutputSchema)
		.handler(async ({ context, input, errors }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"read",
				"Missing workspace permissions."
			);

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
		.route({
			method: "POST",
			path: "/alarms/create",
			tags: ["Alarms"],
			summary: "Create alarm",
			description: "Creates a new alarm for a workspace.",
		})
		.input(alarmInputSchema)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"update",
				"Missing workspace permissions."
			);

			if (input.websiteId) {
				await assertWebsiteBelongsToOrg(
					context,
					input.organizationId,
					input.websiteId
				);
			}

			const alarmId = randomUUIDv7();
			const now = new Date();

			const [created] = await context.db
				.insert(alarms)
				.values({
					id: alarmId,
					organizationId: input.organizationId,
					userId: context.user?.id ?? null,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled ?? true,
					notificationChannels: input.notificationChannels ?? [],
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses ?? [],
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders ?? {},
					conditions: input.conditions ?? {},
					createdAt: now,
					updatedAt: now,
				})
				.returning();

			return created;
		}),

	update: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/update",
			tags: ["Alarms"],
			summary: "Update alarm",
			description: "Updates an existing alarm.",
		})
		.input(
			alarmInputSchema
				.extend({ id: z.string() })
				.partial({
					name: true,
					description: true,
					enabled: true,
					notificationChannels: true,
					slackWebhookUrl: true,
					discordWebhookUrl: true,
					emailAddresses: true,
					webhookUrl: true,
					webhookHeaders: true,
					conditions: true,
					websiteId: true,
				})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input, errors }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"update",
				"Missing workspace permissions."
			);

			if (input.websiteId) {
				await assertWebsiteBelongsToOrg(
					context,
					input.organizationId,
					input.websiteId
				);
			}

			const [existing] = await context.db
				.select({ id: alarms.id })
				.from(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						eq(alarms.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!existing) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			const updateData: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) updateData.name = input.name;
			if (input.description !== undefined)
				updateData.description = input.description ?? null;
			if (input.enabled !== undefined) updateData.enabled = input.enabled;
			if (input.notificationChannels !== undefined)
				updateData.notificationChannels = input.notificationChannels;
			if (input.slackWebhookUrl !== undefined)
				updateData.slackWebhookUrl = input.slackWebhookUrl ?? null;
			if (input.discordWebhookUrl !== undefined)
				updateData.discordWebhookUrl = input.discordWebhookUrl ?? null;
			if (input.emailAddresses !== undefined)
				updateData.emailAddresses = input.emailAddresses;
			if (input.webhookUrl !== undefined)
				updateData.webhookUrl = input.webhookUrl ?? null;
			if (input.webhookHeaders !== undefined)
				updateData.webhookHeaders = input.webhookHeaders ?? {};
			if (input.conditions !== undefined)
				updateData.conditions = input.conditions ?? {};
			if (input.websiteId !== undefined)
				updateData.websiteId = input.websiteId ?? null;

			const [updated] = await context.db
				.update(alarms)
				.set(updateData)
				.where(
					and(
						eq(alarms.id, input.id),
						eq(alarms.organizationId, input.organizationId)
					)
				)
				.returning();

			return updated;
		}),

	delete: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/delete",
			tags: ["Alarms"],
			summary: "Delete alarm",
			description: "Deletes an alarm.",
		})
		.input(z.object({ id: z.string(), organizationId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input, errors }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"update",
				"Missing workspace permissions."
			);

			const deleted = await context.db
				.delete(alarms)
				.where(
					and(
						eq(alarms.id, input.id),
						eq(alarms.organizationId, input.organizationId)
					)
				)
				.returning({ id: alarms.id });

			if (!deleted.length) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: input.id },
				});
			}

			return { success: true };
		}),

	test: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/test",
			tags: ["Alarms"],
			summary: "Test alarm",
			description: "Sends a test notification for an alarm.",
		})
		.input(z.object({ id: z.string(), organizationId: z.string() }))
		.output(z.array(notificationResultSchema))
		.handler(async ({ context, input, errors }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"organization",
				"update",
				"Missing workspace permissions."
			);

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

			return await sendAlarmTest(alarm);
		}),
};
