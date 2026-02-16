import { websitesApi } from "@databuddy/auth";
import {
	alarms,
	and,
	desc,
	eq,
	type SQL,
} from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications/helpers";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";

const notificationChannelSchema = z.enum(["slack", "discord", "email", "webhook"]);

const triggerTypeSchema = z.enum([
	"uptime",
	"traffic_spike",
	"error_rate",
	"goal",
	"custom",
]);

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
	webhookHeaders: z.record(z.string()).nullable(),
	triggerType: z.string(),
	triggerConditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

/**
 * Resolve the organization ID from the current context.
 * Returns the active organization from the session, or falls back to the API key org.
 */
function resolveOrganizationId(context: Context): string | null {
	const sessionOrgId = (
		context.session as { activeOrganizationId?: string | null } | undefined
	)?.activeOrganizationId;
	if (sessionOrgId) return sessionOrgId;
	if (context.apiKey?.organizationId) return context.apiKey.organizationId;
	return null;
}

/**
 * Authorize that the user has access to manage alarms within the given organization.
 */
async function authorizeAlarmAccess(
	context: Context,
	organizationId: string,
	permission: "read" | "update" = "read"
): Promise<void> {
	if (context.user?.role === "ADMIN") return;

	try {
		const { success } = await websitesApi.hasPermission({
			headers: context.headers,
			body: {
				organizationId,
				permissions: { website: [permission] },
			},
		});
		if (!success) {
			throw new ORPCError("FORBIDDEN", {
				message: "You do not have permission to manage alarms in this workspace",
			});
		}
	} catch (error) {
		if (error instanceof ORPCError) throw error;
		throw new ORPCError("FORBIDDEN", {
			message: "You do not have permission to manage alarms in this workspace",
		});
	}
}

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			description:
				"List all alarms for the current user or organization. Optionally filter by website.",
			method: "POST",
			path: "/alarms/list",
			summary: "List alarms",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				websiteId: z.string().optional(),
			})
		)
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId = resolveOrganizationId(context);
			if (organizationId) {
				await authorizeAlarmAccess(context, organizationId, "read");
			}

			const conditions: SQL<unknown>[] = [];

			if (organizationId) {
				conditions.push(eq(alarms.organizationId, organizationId));
			} else if (context.user) {
				conditions.push(eq(alarms.userId, context.user.id));
			}

			if (input.websiteId) {
				conditions.push(eq(alarms.websiteId, input.websiteId));
			}

			const whereClause =
				conditions.length > 0 ? and(...conditions) : undefined;

			return context.db
				.select()
				.from(alarms)
				.where(whereClause)
				.orderBy(desc(alarms.createdAt));
		}),

	get: protectedProcedure
		.route({
			description: "Get a single alarm by ID.",
			method: "POST",
			path: "/alarms/get",
			summary: "Get alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(alarmOutputSchema)
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

			// Authorize access
			if (alarm.organizationId) {
				await authorizeAlarmAccess(context, alarm.organizationId, "read");
			} else if (context.user && alarm.userId !== context.user.id) {
				throw errors.FORBIDDEN({
					message: "You do not have permission to view this alarm",
				});
			}

			return alarm;
		}),

	create: protectedProcedure
		.route({
			description: "Create a new alarm with notification channel configuration.",
			method: "POST",
			path: "/alarms/create",
			summary: "Create alarm",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				name: z.string().min(1).max(200),
				description: z.string().max(1000).optional(),
				websiteId: z.string().optional(),
				enabled: z.boolean().default(true),
				notificationChannels: z
					.array(notificationChannelSchema)
					.min(1, "At least one notification channel is required"),
				slackWebhookUrl: z.string().url().optional(),
				discordWebhookUrl: z.string().url().optional(),
				emailAddresses: z.array(z.string().email()).optional(),
				webhookUrl: z.string().url().optional(),
				webhookHeaders: z.record(z.string()).optional(),
				triggerType: triggerTypeSchema,
				triggerConditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const organizationId = resolveOrganizationId(context);

			if (organizationId) {
				await authorizeAlarmAccess(context, organizationId, "update");
			}

			// Validate that required webhook URLs are provided for selected channels
			for (const channel of input.notificationChannels) {
				if (channel === "slack" && !input.slackWebhookUrl) {
					throw errors.BAD_REQUEST({
						message: "Slack webhook URL is required when Slack channel is selected",
					});
				}
				if (channel === "discord" && !input.discordWebhookUrl) {
					throw errors.BAD_REQUEST({
						message:
							"Discord webhook URL is required when Discord channel is selected",
					});
				}
				if (
					channel === "email" &&
					(!input.emailAddresses || input.emailAddresses.length === 0)
				) {
					throw errors.BAD_REQUEST({
						message:
							"At least one email address is required when Email channel is selected",
					});
				}
				if (channel === "webhook" && !input.webhookUrl) {
					throw errors.BAD_REQUEST({
						message: "Webhook URL is required when Webhook channel is selected",
					});
				}
			}

			const userId = context.user?.id ?? null;
			const alarmId = randomUUIDv7();

			const [newAlarm] = await context.db
				.insert(alarms)
				.values({
					id: alarmId,
					userId,
					organizationId,
					websiteId: input.websiteId ?? null,
					name: input.name,
					description: input.description ?? null,
					enabled: input.enabled,
					notificationChannels: input.notificationChannels,
					slackWebhookUrl: input.slackWebhookUrl ?? null,
					discordWebhookUrl: input.discordWebhookUrl ?? null,
					emailAddresses: input.emailAddresses ?? [],
					webhookUrl: input.webhookUrl ?? null,
					webhookHeaders: input.webhookHeaders ?? null,
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions ?? null,
				})
				.returning();

			return newAlarm;
		}),

	update: protectedProcedure
		.route({
			description: "Update an existing alarm.",
			method: "POST",
			path: "/alarms/update",
			summary: "Update alarm",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).max(200).optional(),
				description: z.string().max(1000).optional().nullable(),
				websiteId: z.string().optional().nullable(),
				enabled: z.boolean().optional(),
				notificationChannels: z
					.array(notificationChannelSchema)
					.min(1)
					.optional(),
				slackWebhookUrl: z.string().url().optional().nullable(),
				discordWebhookUrl: z.string().url().optional().nullable(),
				emailAddresses: z.array(z.string().email()).optional(),
				webhookUrl: z.string().url().optional().nullable(),
				webhookHeaders: z.record(z.string()).optional().nullable(),
				triggerType: triggerTypeSchema.optional(),
				triggerConditions: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().nullable(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input, errors }) => {
			const { id, ...updateData } = input;

			const [existing] = await context.db
				.select()
				.from(alarms)
				.where(eq(alarms.id, id))
				.limit(1);

			if (!existing) {
				throw errors.NOT_FOUND({
					message: "Alarm not found",
					data: { resourceType: "alarm", resourceId: id },
				});
			}

			// Authorize
			if (existing.organizationId) {
				await authorizeAlarmAccess(context, existing.organizationId, "update");
			} else if (context.user && existing.userId !== context.user.id) {
				throw errors.FORBIDDEN({
					message: "You do not have permission to update this alarm",
				});
			}

			const [updatedAlarm] = await context.db
				.update(alarms)
				.set({
					...updateData,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, id))
				.returning();

			return updatedAlarm;
		}),

	delete: protectedProcedure
		.route({
			description: "Delete an alarm.",
			method: "POST",
			path: "/alarms/delete",
			summary: "Delete alarm",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
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

			// Authorize
			if (existing.organizationId) {
				await authorizeAlarmAccess(context, existing.organizationId, "update");
			} else if (context.user && existing.userId !== context.user.id) {
				throw errors.FORBIDDEN({
					message: "You do not have permission to delete this alarm",
				});
			}

			await context.db.delete(alarms).where(eq(alarms.id, input.id));

			return { success: true as const };
		}),

	test: protectedProcedure
		.route({
			description:
				"Send a test notification to all configured channels for an alarm.",
			method: "POST",
			path: "/alarms/test",
			summary: "Test alarm notifications",
			tags: ["Alarms"],
		})
		.input(z.object({ id: z.string() }))
		.output(
			z.object({
				results: z.array(
					z.object({
						channel: z.string(),
						success: z.boolean(),
						error: z.string().optional(),
					})
				),
			})
		)
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

			// Authorize
			if (alarm.organizationId) {
				await authorizeAlarmAccess(context, alarm.organizationId, "update");
			} else if (context.user && alarm.userId !== context.user.id) {
				throw errors.FORBIDDEN({
					message: "You do not have permission to test this alarm",
				});
			}

			const testPayload = {
				title: `🔔 Test Alarm: ${alarm.name}`,
				message: `This is a test notification from Databuddy. If you're seeing this, your alarm "${alarm.name}" is configured correctly!`,
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					alarmName: alarm.name,
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
					switch (channel) {
						case "slack": {
							if (!alarm.slackWebhookUrl) {
								results.push({
									channel,
									success: false,
									error: "Slack webhook URL not configured",
								});
								break;
							}
							const slackResult = await sendSlackWebhook(
								alarm.slackWebhookUrl,
								testPayload
							);
							results.push({
								channel,
								success: slackResult.success,
								error: slackResult.error,
							});
							break;
						}
						case "discord": {
							if (!alarm.discordWebhookUrl) {
								results.push({
									channel,
									success: false,
									error: "Discord webhook URL not configured",
								});
								break;
							}
							const discordResult = await sendDiscordWebhook(
								alarm.discordWebhookUrl,
								testPayload
							);
							results.push({
								channel,
								success: discordResult.success,
								error: discordResult.error,
							});
							break;
						}
						case "webhook": {
							if (!alarm.webhookUrl) {
								results.push({
									channel,
									success: false,
									error: "Webhook URL not configured",
								});
								break;
							}
							const webhookResult = await sendWebhook(
								alarm.webhookUrl,
								testPayload,
								{
									headers: (alarm.webhookHeaders as Record<string, string>) ?? undefined,
								}
							);
							results.push({
								channel,
								success: webhookResult.success,
								error: webhookResult.error,
							});
							break;
						}
						case "email": {
							// Email requires the sendEmail function from the app context.
							// For test purposes, we note it's not directly available in the RPC layer.
							results.push({
								channel,
								success: false,
								error:
									"Email test notifications require app-level email service configuration",
							});
							break;
						}
						default:
							results.push({
								channel,
								success: false,
								error: `Unknown channel: ${channel}`,
							});
					}
				} catch (error) {
					results.push({
						channel,
						success: false,
						error:
							error instanceof Error ? error.message : "Unknown error occurred",
					});
				}
			}

			return { results };
		}),
};
