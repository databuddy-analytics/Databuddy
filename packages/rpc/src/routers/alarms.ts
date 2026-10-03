import { db, eq, withTransaction } from "@databuddy/db";
import {
	alarmDestinations,
	alarms,
	alarmTriggerTypeValues,
} from "@databuddy/db/schema";
import { MAX_ALARM_DESTINATIONS } from "@databuddy/notifications";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	ALARM_DESTINATION_REGISTRY,
	type AlarmDestinationType,
	maskTail,
	redactDestinationConfig,
} from "@databuddy/shared/alarm-destinations";
import { createSelectSchema } from "drizzle-orm/zod";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import {
	sendNotificationTarget,
	toNotificationTargets,
} from "../lib/alarm-notifications";
import { setTrackProperties } from "../middleware/track-mutation";
import { type Context, protectedProcedure, trackedProcedure } from "../orpc";
import { withResource } from "../procedures/with-resource";
import { withWorkspace } from "../procedures/with-workspace";

const slackDestinationSchema = z.object({
	type: z.literal("slack"),
	identifier: ALARM_DESTINATION_REGISTRY.slack.identifierSchema,
	config: ALARM_DESTINATION_REGISTRY.slack.configSchema,
});

const webhookDestinationSchema = z.object({
	type: z.literal("webhook"),
	identifier: ALARM_DESTINATION_REGISTRY.webhook.identifierSchema,
	config: ALARM_DESTINATION_REGISTRY.webhook.configSchema,
});

const emailDestinationSchema = z.object({
	type: z.literal("email"),
	identifier: ALARM_DESTINATION_REGISTRY.email.identifierSchema,
	config: ALARM_DESTINATION_REGISTRY.email.configSchema,
});

/**
 * One branch per entry in `ALARM_DESTINATION_TYPES`; the drift test in
 * `alarms.test.ts` asserts this union's literal types, the DB's
 * `alarmDestinationTypeValues`, and the delivery builder's handled types are
 * exactly the same set.
 */
export const destinationSchema = z.discriminatedUnion("type", [
	slackDestinationSchema,
	webhookDestinationSchema,
	emailDestinationSchema,
]);

const jsonRecord = z.record(z.string(), z.unknown());
const alarmOutputSchema = createSelectSchema(alarms, {
	triggerConditions: jsonRecord,
}).extend({
	destinations: z.array(
		createSelectSchema(alarmDestinations, { config: jsonRecord })
	),
});

interface RedactableDestination {
	config: Record<string, unknown>;
	identifier: string;
	type: string;
}

function redactDestination<T extends RedactableDestination>(d: T): T {
	const definition = ALARM_DESTINATION_REGISTRY[d.type as AlarmDestinationType];
	return {
		...d,
		identifier:
			definition && !definition.maskIdentifier
				? d.identifier
				: maskTail(d.identifier),
		config: definition
			? redactDestinationConfig(d.config, definition.secretFields)
			: d.config,
	};
}

function redactAlarm<T extends { destinations?: RedactableDestination[] }>(
	alarm: T
): T {
	if (!alarm.destinations) {
		return alarm;
	}
	return { ...alarm, destinations: alarm.destinations.map(redactDestination) };
}

async function callerCanReadSecrets(
	context: Context,
	organizationId: string
): Promise<boolean> {
	try {
		await withWorkspace(context, {
			organizationId,
			resource: "organization",
			permissions: ["update"],
		});
		return true;
	} catch {
		return false;
	}
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

			const rows = await db.query.alarms.findMany({
				where: { organizationId: orgId },
				orderBy: { createdAt: "desc" },
				with: { destinations: true },
				limit: 100,
			});

			if (await callerCanReadSecrets(context, orgId)) {
				return rows;
			}
			return rows.map(redactAlarm);
		}),

	create: trackedProcedure
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
					.min(1, "At least one destination is required")
					.max(MAX_ALARM_DESTINATIONS),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({
				trigger_type: input.triggerType,
				destination_count: input.destinations.length,
			});
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const alarmId = randomUUIDv7();
			const now = new Date();

			await withTransaction(async (tx) => {
				await tx.insert(alarms).values({
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
					await tx.insert(alarmDestinations).values(
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
			});

			return await withResource(context, {
				resource: "alarm",
				id: alarmId,
				permissions: ["read"],
			});
		}),

	update: trackedProcedure
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
				destinations: z
					.array(destinationSchema)
					.max(MAX_ALARM_DESTINATIONS)
					.optional(),
			})
		)
		.output(alarmOutputSchema)
		.handler(async ({ context, input }) => {
			await withResource(context, {
				resource: "alarm",
				id: input.alarmId,
				permissions: ["update"],
			});
			const now = new Date();

			const { alarmId, destinations, ...fields } = input;
			const updateData = Object.fromEntries(
				Object.entries(fields).filter(([_, v]) => v !== undefined)
			);

			await withTransaction(async (tx) => {
				await tx
					.update(alarms)
					.set({ ...updateData, updatedAt: now })
					.where(eq(alarms.id, alarmId));

				if (input.destinations !== undefined) {
					await tx
						.delete(alarmDestinations)
						.where(eq(alarmDestinations.alarmId, input.alarmId));

					if (input.destinations.length > 0) {
						await tx.insert(alarmDestinations).values(
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
			});

			return await withResource(context, {
				resource: "alarm",
				id: input.alarmId,
				permissions: ["read"],
			});
		}),

	delete: trackedProcedure
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
			await withResource(context, {
				resource: "alarm",
				id: input.alarmId,
				permissions: ["delete"],
			});
			await db.delete(alarms).where(eq(alarms.id, input.alarmId));
			return { success: true };
		}),

	test: trackedProcedure
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
			const alarm = await withResource(context, {
				resource: "alarm",
				id: input.alarmId,
				permissions: ["update"],
			});

			const principal = context.user
				? `user:${context.user.id}`
				: context.apiKey
					? `apikey:${context.apiKey.id}`
					: null;
			if (principal) {
				const rl = await ratelimit(
					`alarms:test:${principal}:${input.alarmId}`,
					5,
					60
				);
				if (!rl.success) {
					throw rpcError.rateLimited(rl.reset);
				}
			}

			if (!alarm.destinations || alarm.destinations.length === 0) {
				throw rpcError.badRequest("Alarm has no destinations configured");
			}

			const targets = toNotificationTargets(alarm.destinations);
			const payload = {
				title: `Test alert: ${alarm.name}`,
				message: `This is a test notification from your "${alarm.name}" alert. If you received it, this destination is working.`,
				priority: "normal" as const,
				metadata: {
					template: "test",
					alarmId: alarm.id,
					alarmName: alarm.name,
				},
			};
			const raw = (
				await Promise.all(
					targets.map((target) => sendNotificationTarget(target, payload))
				)
			).flat();

			return {
				results: raw.map((r) => ({
					success: r.success,
					channel: r.channel,
					error: r.error,
				})),
			};
		}),
};
