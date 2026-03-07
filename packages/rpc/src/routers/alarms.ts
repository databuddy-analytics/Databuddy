import { websitesApi } from "@databuddy/auth";
import {
	alarms,
	alarmTriggers,
	and,
	desc,
	eq,
	isNull,
	member,
	websites,
} from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import {
	createAlarmSchema,
	deleteAlarmSchema,
	getAlarmSchema,
	listAlarmsSchema,
	testAlarmSchema,
	updateAlarmSchema,
} from "@databuddy/shared/alarms";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const authorizeScope = async (
	context: Context,
	websiteId?: string,
	organizationId?: string,
	permission: "read" | "update" | "delete" = "read"
) => {
	if (websiteId) {
		await authorizeWebsiteAccess(context, websiteId, permission);
	} else if (organizationId) {
		const headersObj: Record<string, string> = {};
		context.headers.forEach((value, key) => {
			headersObj[key] = value;
		});
		const perm =
			permission === "read"
				? "read"
				: permission === "delete"
					? "delete"
					: "create";
		try {
			const { success } = await websitesApi.hasPermission({
				headers: headersObj,
				body: {
					organizationId,
					permissions: { website: [perm] },
				},
			});
			if (!success) {
				throw new ORPCError("FORBIDDEN", {
					message: "Missing organization permissions.",
				});
			}
		} catch (error) {
			if (error instanceof ORPCError) {
				throw error;
			}
			throw new ORPCError("FORBIDDEN", {
				message: "Missing organization permissions.",
			});
		}
	}
};

const successOutputSchema = z.object({ success: z.literal(true) });
const alarmOutputSchema = z.record(z.string(), z.unknown());

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			description: "Returns all alarms for a website or organization.",
			method: "POST",
			path: "/alarms/list",
			summary: "List alarms",
			tags: ["Alarms"],
		})
		.input(listAlarmsSchema)
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"read"
			);

			const conditions = [isNull(alarms.deletedAt)];

			if (input.websiteId) {
				conditions.push(eq(alarms.websiteId, input.websiteId));
			} else if (input.organizationId) {
				conditions.push(eq(alarms.organizationId, input.organizationId));
			}

			const alarmsList = await context.db
				.select()
				.from(alarms)
				.where(and(...conditions))
				.orderBy(desc(alarms.createdAt));

			return alarmsList;
		}),

	get: protectedProcedure
		.route({
			description: "Returns a single alarm by ID.",
			method: "POST",
			path: "/alarms/get",
			summary: "Get alarm",
			tags: ["Alarms"],
		})
		.input(getAlarmSchema)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			const alarm = await context.db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (alarm.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const found = alarm[0];

			if (found.websiteId) {
				await authorizeWebsiteAccess(context, found.websiteId, "read");
			} else if (found.organizationId) {
				await authorizeScope(context, undefined, found.organizationId, "read");
			}

			return found;
		}),

	create: protectedProcedure
		.route({
			description: "Creates a new alarm.",
			method: "POST",
			path: "/alarms/create",
			summary: "Create alarm",
			tags: ["Alarms"],
		})
		.input(createAlarmSchema)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await authorizeScope(
				context,
				input.websiteId,
				input.organizationId,
				"update"
			);

			let createdBy: string;
			if (context.user) {
				createdBy = context.user.id;
			} else if (context.apiKey) {
				const orgId =
					input.organizationId ??
					(input.websiteId
						? (
								await context.db
									.select({ organizationId: websites.organizationId })
									.from(websites)
									.where(eq(websites.id, input.websiteId))
									.limit(1)
							)[0]?.organizationId
						: null);
				if (!orgId) {
					throw new ORPCError("FORBIDDEN", {
						message: "Scope must belong to a workspace",
					});
				}
				const resolvedOrgId = context.apiKey.organizationId ?? orgId;
				const [ownerRow] = await context.db
					.select({ userId: member.userId })
					.from(member)
					.where(
						and(
							eq(member.organizationId, resolvedOrgId),
							eq(member.role, "owner")
						)
					)
					.limit(1);
				if (!ownerRow) {
					throw new ORPCError("FORBIDDEN", {
						message: "Could not resolve organization owner for API key",
					});
				}
				createdBy = ownerRow.userId;
			} else {
				throw new ORPCError("UNAUTHORIZED", {
					message: "Authentication is required",
				});
			}

			const alarmId = randomUUIDv7();

			const [newAlarm] = await context.db
				.insert(alarms)
				.values({
					id: alarmId,
					name: input.name,
					description: input.description || null,
					enabled: input.enabled ?? true,
					notificationChannels: input.notificationChannels || [],
					slackWebhookUrl: input.slackWebhookUrl || null,
					discordWebhookUrl: input.discordWebhookUrl || null,
					emailAddresses: input.emailAddresses || [],
					webhookUrl: input.webhookUrl || null,
					webhookHeaders: input.webhookHeaders || {},
					triggerType: input.triggerType,
					triggerConditions: input.triggerConditions || {},
					websiteId: input.websiteId || null,
					organizationId: input.organizationId || null,
					userId: context.user?.id || null,
					createdBy,
				})
				.returning();

			return newAlarm;
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
			const existing = await context.db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (existing.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const alarm = existing[0];

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "update");
			} else if (alarm.organizationId) {
				await authorizeScope(
					context,
					undefined,
					alarm.organizationId,
					"update"
				);
			}

			const { id, ...updates } = input;

			// Clean up empty string URLs to null
			const cleanedUpdates: Record<string, unknown> = { ...updates };
			for (const key of [
				"slackWebhookUrl",
				"discordWebhookUrl",
				"webhookUrl",
			]) {
				if (key in cleanedUpdates && cleanedUpdates[key] === "") {
					cleanedUpdates[key] = null;
				}
			}

			const [updatedAlarm] = await context.db
				.update(alarms)
				.set({
					...cleanedUpdates,
					updatedAt: new Date(),
				})
				.where(and(eq(alarms.id, id), isNull(alarms.deletedAt)))
				.returning();

			return updatedAlarm;
		}),

	delete: protectedProcedure
		.route({
			description: "Soft-deletes an alarm.",
			method: "POST",
			path: "/alarms/delete",
			summary: "Delete alarm",
			tags: ["Alarms"],
		})
		.input(deleteAlarmSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const existing = await context.db
				.select({
					websiteId: alarms.websiteId,
					organizationId: alarms.organizationId,
				})
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (existing.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const alarm = existing[0];

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "delete");
			} else if (alarm.organizationId) {
				await authorizeScope(
					context,
					undefined,
					alarm.organizationId,
					"delete"
				);
			}

			await context.db
				.update(alarms)
				.set({
					deletedAt: new Date(),
					enabled: false,
				})
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)));

			return { success: true as const };
		}),

	test: protectedProcedure
		.route({
			description: "Sends a test notification for an alarm.",
			method: "POST",
			path: "/alarms/test",
			summary: "Test alarm notification",
			tags: ["Alarms"],
		})
		.input(testAlarmSchema)
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
			const existing = await context.db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (existing.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const alarm = existing[0];

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "update");
			} else if (alarm.organizationId) {
				await authorizeScope(
					context,
					undefined,
					alarm.organizationId,
					"update"
				);
			}

			const channels = (alarm.notificationChannels as string[]) || [];
			const testPayload = {
				title: `Test Alert: ${alarm.name}`,
				message: `This is a test notification from your alarm "${alarm.name}". If you receive this, your notification channel is configured correctly.`,
				priority: "normal" as const,
			};

			const results: Array<{
				channel: string;
				success: boolean;
				error?: string;
			}> = [];

			for (const channel of channels) {
				try {
					switch (channel) {
						case "slack": {
							if (alarm.slackWebhookUrl) {
								const result = await sendSlackWebhook(
									alarm.slackWebhookUrl,
									testPayload
								);
								results.push({
									channel: "slack",
									success: result.success,
									error: result.error,
								});
							} else {
								results.push({
									channel: "slack",
									success: false,
									error: "No Slack webhook URL configured",
								});
							}
							break;
						}
						case "discord": {
							if (alarm.discordWebhookUrl) {
								const result = await sendDiscordWebhook(
									alarm.discordWebhookUrl,
									testPayload
								);
								results.push({
									channel: "discord",
									success: result.success,
									error: result.error,
								});
							} else {
								results.push({
									channel: "discord",
									success: false,
									error: "No Discord webhook URL configured",
								});
							}
							break;
						}
						case "webhook": {
							if (alarm.webhookUrl) {
								const result = await sendWebhook(
									alarm.webhookUrl,
									testPayload,
									{
										headers:
											(alarm.webhookHeaders as Record<string, string>) ||
											undefined,
									}
								);
								results.push({
									channel: "webhook",
									success: result.success,
									error: result.error,
								});
							} else {
								results.push({
									channel: "webhook",
									success: false,
									error: "No webhook URL configured",
								});
							}
							break;
						}
						case "email": {
							// Email sending requires an email provider configured at app level
							results.push({
								channel: "email",
								success: false,
								error:
									"Email notifications require server-side email configuration",
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
				} catch (err) {
					results.push({
						channel,
						success: false,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			if (channels.length === 0) {
				results.push({
					channel: "none",
					success: false,
					error: "No notification channels configured for this alarm",
				});
			}

			return {
				success: results.some((r) => r.success),
				results,
			};
		}),

	listByWebsite: protectedProcedure
		.route({
			description: "Returns all uptime alarms assigned to a specific website.",
			method: "POST",
			path: "/alarms/listByWebsite",
			summary: "List alarms by website",
			tags: ["Alarms"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const alarmsList = await context.db
				.select()
				.from(alarms)
				.where(
					and(eq(alarms.websiteId, input.websiteId), isNull(alarms.deletedAt))
				)
				.orderBy(desc(alarms.createdAt));

			return alarmsList;
		}),

	listTriggers: protectedProcedure
		.route({
			description: "Returns alarm trigger history for a website.",
			method: "POST",
			path: "/alarms/listTriggers",
			summary: "List alarm triggers",
			tags: ["Alarms"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				limit: z.number().int().min(1).max(100).default(20),
			})
		)
		.output(z.array(z.record(z.string(), z.unknown())))
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const triggers = await context.db
				.select()
				.from(alarmTriggers)
				.where(eq(alarmTriggers.websiteId, input.websiteId))
				.orderBy(desc(alarmTriggers.createdAt))
				.limit(input.limit);

			return triggers;
		}),
};
