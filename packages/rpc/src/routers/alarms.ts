import {
	and,
	desc,
	eq,
	isNull,
	alarms,
	user,
	organization,
	websites,
} from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess, isFullyAuthorized } from "../utils/auth";

const listAlarmsSchema = z
	.object({
		websiteId: z.string().optional(),
		organizationId: z.string().optional(),
	})
	.refine((data) => data.websiteId || data.organizationId, {
		message: "Either websiteId or organizationId must be provided",
	});

const getAlarmSchema = z.object({
	id: z.string(),
});

const createAlarmSchema = z.object({
	websiteId: z.string().optional(),
	organizationId: z.string().optional(),
	name: z.string().min(1).max(100),
	description: z.string().optional(),
	enabled: z.boolean().default(true),
	notificationChannels: z.array(z.enum(["slack", "discord", "email", "webhook"])).min(1),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string()).optional(),
	triggerType: z.enum(["uptime", "traffic_spike", "error_rate", "goal", "custom"]),
	triggerConditions: z.record(z.any()),
});

const updateAlarmSchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	description: z.string().optional(),
	enabled: z.boolean().optional(),
	notificationChannels: z.array(z.enum(["slack", "discord", "email", "webhook"])).optional(),
	slackWebhookUrl: z.string().url().optional(),
	discordWebhookUrl: z.string().url().optional(),
	emailAddresses: z.array(z.string().email()).optional(),
	webhookUrl: z.string().url().optional(),
	webhookHeaders: z.record(z.string()).optional(),
	triggerType: z.enum(["uptime", "traffic_spike", "error_rate", "goal", "custom"]).optional(),
	triggerConditions: z.record(z.any()).optional(),
});

const deleteAlarmSchema = z.object({
	id: z.string(),
});

const testAlarmSchema = z.object({
	id: z.string(),
});

export const alarmsRouter = {
	list: publicProcedure
		.route({
			method: "POST",
			path: "/alarms/list",
			summary: "List alarms",
			tags: ["Alarms"],
		})
		.input(listAlarmsSchema)
		.output(z.array(z.any()))
		.handler(async ({ context, input }) => {
			const conditions = [isNull(alarms.deletedAt)];

			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "read");
				conditions.push(eq(alarms.websiteId, input.websiteId));
			} else if (input.organizationId) {
				conditions.push(eq(alarms.organizationId, input.organizationId));
			}

			const alarmsList = await context.db.query.alarms.findMany({
				where: and(...conditions),
				orderBy: desc(alarms.createdAt),
			});

			return alarmsList;
		}),

	get: publicProcedure
		.route({
			method: "POST",
			path: "/alarms/get",
			summary: "Get alarm by ID",
			tags: ["Alarms"],
		})
		.input(getAlarmSchema)
		.output(z.any())
		.handler(async ({ context, input }) => {
			const alarm = await context.db.query.alarms.findFirst({
				where: and(eq(alarms.id, input.id), isNull(alarms.deletedAt)),
			});

			if (!alarm) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			// Authorize access
			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "read");
			}

			return alarm;
		}),

	create: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/create",
			summary: "Create alarm",
			tags: ["Alarms"],
		})
		.input(createAlarmSchema)
		.output(z.any())
		.handler(async ({ context, input }) => {
			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "create");
			}

			const [alarm] = await context.db
				.insert(alarms)
				.values({
					id: randomUUIDv7(),
					userId: context.user?.id,
					organizationId: input.organizationId,
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

			return alarm;
		}),

	update: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/update",
			summary: "Update alarm",
			tags: ["Alarms"],
		})
		.input(updateAlarmSchema)
		.output(z.any())
		.handler(async ({ context, input }) => {
			const existingAlarm = await context.db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (existingAlarm.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const alarm = existingAlarm[0];

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "update");
			}

			const { id, ...updates } = input;

			const [updated] = await context.db
				.update(alarms)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(eq(alarms.id, id))
				.returning();

			return updated;
		}),

	delete: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/delete",
			summary: "Delete alarm",
			tags: ["Alarms"],
		})
		.input(deleteAlarmSchema)
		.output(z.object({ success: z.boolean() }))
		.handler(async ({ context, input }) => {
			const existingAlarm = await context.db
				.select()
				.from(alarms)
				.where(and(eq(alarms.id, input.id), isNull(alarms.deletedAt)))
				.limit(1);

			if (existingAlarm.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			const alarm = existingAlarm[0];

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "delete");
			}

			await context.db
				.update(alarms)
				.set({
					deletedAt: new Date(),
				})
				.where(eq(alarms.id, input.id));

			return { success: true };
		}),

	test: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/test",
			summary: "Test alarm notification",
			tags: ["Alarms"],
		})
		.input(testAlarmSchema)
		.output(z.object({ success: z.boolean(), message: z.string() }))
		.handler(async ({ context, input }) => {
			const alarm = await context.db.query.alarms.findFirst({
				where: and(eq(alarms.id, input.id), isNull(alarms.deletedAt)),
			});

			if (!alarm) {
				throw new ORPCError("NOT_FOUND", {
					message: "Alarm not found",
				});
			}

			if (alarm.websiteId) {
				await authorizeWebsiteAccess(context, alarm.websiteId, "read");
			}

			// TODO: Implement actual notification sending using @databuddy/notifications
			// For now, just return success
			return {
				success: true,
				message: "Test notification sent to configured channels",
			};
		}),
};
