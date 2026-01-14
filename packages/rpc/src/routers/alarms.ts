import { alarms, and, db, eq, isNull, or } from "@databuddy/db";
import {
	sendDiscordWebhook,
	sendSlackWebhook,
	sendWebhook,
} from "@databuddy/notifications";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure } from "../orpc";

const alarmChannelEnum = z.enum(["slack", "discord", "email", "webhook"]);

async function getAlarmAndAuthorize(
	alarmId: string,
	context: { user: { id: string }; session: { activeOrganizationId?: string | null } }
) {
	const alarm = await db.query.alarms.findFirst({
		where: eq(alarms.id, alarmId),
	});

	if (!alarm) {
		throw new ORPCError("NOT_FOUND", { message: "Alarm not found" });
	}

	const activeOrgId = context.session?.activeOrganizationId;

	// Check if user owns the alarm or if it belongs to their active org
	const isOwner = alarm.userId === context.user.id;
	const isOrgAlarm = activeOrgId && alarm.organizationId === activeOrgId;

	if (!isOwner && !isOrgAlarm) {
		throw new ORPCError("FORBIDDEN", { message: "Access denied" });
	}

	return alarm;
}

export const alarmsRouter = {
	list: protectedProcedure
		.input(
			z.object({
				organizationId: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const activeOrgId =
				input.organizationId ?? context.session?.activeOrganizationId;

			const conditions = [];

			if (activeOrgId) {
				// Show org alarms and user's personal alarms
				conditions.push(
					or(
						eq(alarms.organizationId, activeOrgId),
						and(
							eq(alarms.userId, context.user.id),
							isNull(alarms.organizationId)
						)
					)
				);
			} else {
				// Only personal alarms
				conditions.push(eq(alarms.userId, context.user.id));
			}

			return await db.query.alarms.findMany({
				where: and(...conditions),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
		}),

	get: protectedProcedure
		.input(z.object({ alarmId: z.string() }))
		.handler(async ({ context, input }) => {
			return await getAlarmAndAuthorize(input.alarmId, context);
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				channel: alarmChannelEnum,
				target: z.string().min(1),
				organizationId: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const alarmId = randomUUIDv7();
			const activeOrgId =
				input.organizationId ?? context.session?.activeOrganizationId;

			await db.insert(alarms).values({
				id: alarmId,
				userId: context.user.id,
				organizationId: activeOrgId ?? null,
				name: input.name,
				description: input.description ?? null,
				channel: input.channel,
				target: input.target,
				enabled: true,
			});

			logger.info({ alarmId, channel: input.channel }, "Alarm created");

			return await db.query.alarms.findFirst({
				where: eq(alarms.id, alarmId),
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				alarmId: z.string(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().max(500).optional(),
				channel: alarmChannelEnum.optional(),
				target: z.string().min(1).optional(),
				enabled: z.boolean().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await getAlarmAndAuthorize(input.alarmId, context);

			const updateData: Record<string, unknown> = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) updateData.name = input.name;
			if (input.description !== undefined)
				updateData.description = input.description;
			if (input.channel !== undefined) updateData.channel = input.channel;
			if (input.target !== undefined) updateData.target = input.target;
			if (input.enabled !== undefined) updateData.enabled = input.enabled;

			await db
				.update(alarms)
				.set(updateData)
				.where(eq(alarms.id, input.alarmId));

			logger.info({ alarmId: input.alarmId }, "Alarm updated");

			return await db.query.alarms.findFirst({
				where: eq(alarms.id, input.alarmId),
			});
		}),

	delete: protectedProcedure
		.input(z.object({ alarmId: z.string() }))
		.handler(async ({ context, input }) => {
			await getAlarmAndAuthorize(input.alarmId, context);

			await db.delete(alarms).where(eq(alarms.id, input.alarmId));

			logger.info({ alarmId: input.alarmId }, "Alarm deleted");

			return { success: true };
		}),

	test: protectedProcedure
		.input(z.object({ alarmId: z.string() }))
		.handler(async ({ context, input }) => {
			const alarm = await getAlarmAndAuthorize(input.alarmId, context);

			const payload = {
				title: "Test Notification",
				message: `This is a test notification from alarm "${alarm.name}"`,
				priority: "normal" as const,
				metadata: {
					alarmId: alarm.id,
					alarmName: alarm.name,
					timestamp: new Date().toISOString(),
					isTest: true,
				},
			};

			try {
				switch (alarm.channel) {
					case "slack":
						await sendSlackWebhook(alarm.target, payload);
						break;
					case "discord":
						await sendDiscordWebhook(alarm.target, payload);
						break;
					case "webhook":
						await sendWebhook(alarm.target, payload);
						break;
					case "email":
						// Email requires additional configuration
						throw new ORPCError("BAD_REQUEST", {
							message: "Email test notifications are not yet supported",
						});
				}

				logger.info(
					{ alarmId: alarm.id, channel: alarm.channel },
					"Test notification sent"
				);

				return { success: true, message: "Test notification sent" };
			} catch (error) {
				logger.error(
					{ alarmId: alarm.id, error },
					"Failed to send test notification"
				);

				if (error instanceof ORPCError) {
					throw error;
				}

				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to send test notification",
				});
			}
		}),

	toggle: protectedProcedure
		.input(z.object({ alarmId: z.string(), enabled: z.boolean() }))
		.handler(async ({ context, input }) => {
			await getAlarmAndAuthorize(input.alarmId, context);

			await db
				.update(alarms)
				.set({ enabled: input.enabled, updatedAt: new Date() })
				.where(eq(alarms.id, input.alarmId));

			logger.info(
				{ alarmId: input.alarmId, enabled: input.enabled },
				"Alarm toggled"
			);

			return { success: true, enabled: input.enabled };
		}),
};
