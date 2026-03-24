import {
	alarmDestinations,
	alarmDestinationTypeValues,
	alarms,
	alarmTriggerTypeValues,
	db,
	eq,
} from "@databuddy/db";
import {
	type NotificationChannel,
	NotificationClient,
} from "@databuddy/notifications";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { protectedProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const destinationSchema = z.object({
	type: z.enum(alarmDestinationTypeValues),
	identifier: z.string().default(""),
	config: z.record(z.string(), z.unknown()).default({}),
});

const alarmOutputSchema = z.record(z.string(), z.unknown());

async function getAlarmAndAuthorize(
	alarmId: string,
	context: Parameters<typeof withWorkspace>[0],
	permissions: ("read" | "update" | "delete")[] = ["read"]
) {
	const alarm = await db.query.alarms.findFirst({
		where: eq(alarms.id, alarmId),
		with: { destinations: true },
	});

	if (!alarm) {
		throw rpcError.notFound("Alarm", alarmId);
	}

	await withWorkspace(context, {
		organizationId: alarm.organizationId,
		resource: "organization",
		permissions,
	});

	return alarm;
}

export const alarmsRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/list",
			tags: ["Alarms"],
			summary: "List alarms",
			description: "Returns alarms for the organization.",
		})
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.output(z.array(alarmOutputSchema))
		.handler(async ({ context, input }) => {
			const orgId = input.organizationId ?? context.organizationId;
			if (!orgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: orgId,
				resource: "organization",
				permissions: ["read"],
			});

			return db.query.alarms.findMany({
				where: eq(alarms.organizationId, orgId),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
				with: { destinations: true },
			});
		}),

	get: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/get",
			tags: ["Alarms"],
			summary: "Get alarm",
			description: "Returns a single alarm by ID.",
		})
		.input(z.object({ alarmId: z.string() }))
		.output(alarmOutputSchema)
		.handler(({ context, input }) => {
			return getAlarmAndAuthorize(input.alarmId, context);
		}),

	create: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/create",
			tags: ["Alarms"],
			summary: "Create alarm",
			description: "Creates a new alarm with destinations.",
		})
		.input(
			z.object({
				organizationId: z.string(),
				websiteId: z.string().optional(),
				name: z.string().min(1, "Name is required"),
				description: z.string().optional(),
				enabled: z.boolean().default(true),
				triggerType: z.enum(alarmTriggerTypeValues),
				triggerConditions: z.record(z.string(), z.unknown()).default({}),
				destinations: z
					.array(destinationSchema)
					.min(1, "At least one destination is required"),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const alarmId = randomUUIDv7();
			const now = new Date();

			await db.insert(alarms).values({
				id: alarmId,
				organizationId: input.organizationId,
				websiteId: input.websiteId ?? null,
				name: input.name,
				description: input.description ?? null,
				enabled: input.enabled,
				triggerType: input.triggerType,
				triggerConditions: input.triggerConditions,
				createdAt: now,
				updatedAt: now,
			});

			if (input.destinations.length > 0) {
				await db.insert(alarmDestinations).values(
					input.destinations.map((d) => ({
						id: randomUUIDv7(),
						alarmId,
						type: d.type,
						identifier: d.identifier,
						config: d.config,
						createdAt: now,
						updatedAt: now,
					}))
				);
			}

			return getAlarmAndAuthorize(alarmId, context);
		}),

	update: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/update",
			tags: ["Alarms"],
			summary: "Update alarm",
			description: "Updates an existing alarm and its destinations.",
		})
		.input(
			z.object({
				alarmId: z.string(),
				name: z.string().min(1).optional(),
				description: z.string().nullish(),
				enabled: z.boolean().optional(),
				websiteId: z.string().nullish(),
				triggerType: z.enum(alarmTriggerTypeValues).optional(),
				triggerConditions: z.record(z.string(), z.unknown()).optional(),
				destinations: z.array(destinationSchema).optional(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await getAlarmAndAuthorize(input.alarmId, context, ["update"]);
			const now = new Date();

			const updateData: Record<string, unknown> = { updatedAt: now };
			if (input.name !== undefined) {
				updateData.name = input.name;
			}
			if (input.description !== undefined) {
				updateData.description = input.description;
			}
			if (input.enabled !== undefined) {
				updateData.enabled = input.enabled;
			}
			if (input.websiteId !== undefined) {
				updateData.websiteId = input.websiteId;
			}
			if (input.triggerType !== undefined) {
				updateData.triggerType = input.triggerType;
			}
			if (input.triggerConditions !== undefined) {
				updateData.triggerConditions = input.triggerConditions;
			}

			await db
				.update(alarms)
				.set(updateData)
				.where(eq(alarms.id, input.alarmId));

			if (input.destinations !== undefined) {
				await db
					.delete(alarmDestinations)
					.where(eq(alarmDestinations.alarmId, input.alarmId));

				if (input.destinations.length > 0) {
					await db.insert(alarmDestinations).values(
						input.destinations.map((d) => ({
							id: randomUUIDv7(),
							alarmId: input.alarmId,
							type: d.type,
							identifier: d.identifier,
							config: d.config,
							createdAt: now,
							updatedAt: now,
						}))
					);
				}
			}

			return getAlarmAndAuthorize(input.alarmId, context);
		}),

	delete: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/delete",
			tags: ["Alarms"],
			summary: "Delete alarm",
			description: "Deletes an alarm and all its destinations.",
		})
		.input(z.object({ alarmId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await getAlarmAndAuthorize(input.alarmId, context, ["delete"]);
			await db.delete(alarms).where(eq(alarms.id, input.alarmId));
			return { success: true };
		}),

	test: protectedProcedure
		.route({
			method: "POST",
			path: "/alarms/test",
			tags: ["Alarms"],
			summary: "Test alarm",
			description: "Sends a test notification to all configured channels.",
		})
		.input(z.object({ alarmId: z.string() }))
		.output(
			z.object({
				results: z.array(
					z.object({
						success: z.boolean(),
						channel: z.string(),
						error: z.string().optional(),
					})
				),
			})
		)
		.handler(async ({ context, input }) => {
			const alarm = await getAlarmAndAuthorize(input.alarmId, context);

			if (!alarm.destinations || alarm.destinations.length === 0) {
				throw rpcError.badRequest("Alarm has no destinations configured");
			}

			const clientConfig: Record<string, Record<string, unknown>> = {};
			const channels: NotificationChannel[] = [];

			for (const dest of alarm.destinations) {
				const cfg = (dest.config ?? {}) as Record<string, unknown>;

				if (dest.type === "slack") {
					clientConfig.slack = { webhookUrl: dest.identifier };
					channels.push("slack");
				} else if (dest.type === "discord") {
					clientConfig.discord = { webhookUrl: dest.identifier };
					channels.push("discord");
				} else if (dest.type === "teams") {
					clientConfig.teams = { webhookUrl: dest.identifier };
					channels.push("teams");
				} else if (dest.type === "google_chat") {
					clientConfig.googleChat = { webhookUrl: dest.identifier };
					channels.push("google-chat");
				} else if (dest.type === "telegram") {
					clientConfig.telegram = {
						botToken: cfg.botToken as string,
						chatId: dest.identifier || (cfg.chatId as string),
					};
					channels.push("telegram");
				} else if (dest.type === "webhook") {
					clientConfig.webhook = {
						url: dest.identifier,
						headers: cfg.headers as Record<string, string> | undefined,
					};
					channels.push("webhook");
				}
			}

			const client = new NotificationClient(clientConfig);

			const raw = await client.send(
				{
					title: `Test: ${alarm.name}`,
					message: `This is a test notification from your "${alarm.name}" alarm. If you're reading this, the channel is working.`,
					priority: "normal",
					metadata: {
						template: "test",
						alarmId: alarm.id,
						alarmName: alarm.name,
					},
				},
				{ channels }
			);

			return {
				results: raw.map((r) => ({
					success: r.success,
					channel: r.channel,
					error: r.error,
				})),
			};
		}),
};
