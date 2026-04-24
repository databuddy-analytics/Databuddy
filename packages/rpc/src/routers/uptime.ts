import { and, db, eq } from "@databuddy/db";
import { uptimeSchedules } from "@databuddy/db/schema";
import { ratelimit } from "@databuddy/redis";
import { Client } from "@upstash/qstash";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { protectedProcedure } from "../orpc";
import { withFeatureAccess } from "../procedures/with-feature-access";
import { withWorkspace } from "../procedures/with-workspace";

const monitorsProcedure = protectedProcedure.use(withFeatureAccess("monitors"));

const client = new Client({ token: process.env.UPSTASH_QSTASH_TOKEN });

const CRON_GRANULARITIES = {
	minute: "* * * * *",
	five_minutes: "*/5 * * * *",
	ten_minutes: "*/10 * * * *",
	thirty_minutes: "*/30 * * * *",
	hour: "0 * * * *",
	six_hours: "0 */6 * * *",
	twelve_hours: "0 */12 * * *",
	day: "0 0 * * *",
} as const;

const granularityEnum = z.enum([
	"minute",
	"five_minutes",
	"ten_minutes",
	"thirty_minutes",
	"hour",
	"six_hours",
	"twelve_hours",
	"day",
]);

const isProd = process.env.NODE_ENV === "production";
const UPTIME_URL_GROUP = isProd ? "uptime" : "uptime-staging";

async function getScheduleAndAuthorize(
	scheduleId: string,
	context: Parameters<typeof withWorkspace>[0]
) {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.id, scheduleId),
	});

	if (!schedule) {
		throw rpcError.notFound("Schedule", scheduleId);
	}

	await withWorkspace(context, {
		organizationId: schedule.organizationId,
		resource: "website",
		permissions: ["update"],
	});

	return schedule;
}

async function createQStashSchedule(
	scheduleId: string,
	granularity: z.infer<typeof granularityEnum>
) {
	await client.schedules.create({
		scheduleId,
		destination: UPTIME_URL_GROUP,
		cron: CRON_GRANULARITIES[granularity],
		headers: {
			"Content-Type": "application/json",
			"X-Schedule-Id": scheduleId,
		},
	});
}

function triggerInitialCheck(scheduleId: string) {
	client
		.publish({
			urlGroup: UPTIME_URL_GROUP,
			headers: {
				"Content-Type": "application/json",
				"X-Schedule-Id": scheduleId,
			},
		})
		.catch((error) =>
			logger.error({ scheduleId, error }, "Initial check failed")
		);
}

const getScheduleOutputSchema = z
	.object({
		id: z.string(),
		websiteId: z.string().nullable(),
		organizationId: z.string(),
		url: z.string(),
		name: z.string().nullable(),
		granularity: z.string(),
		cron: z.string(),
		isPaused: z.boolean(),
		timeout: z.number().nullable().optional(),
		cacheBust: z.boolean(),
		jsonParsingConfig: z.unknown().nullable(),
		createdAt: z.union([z.date(), z.string()]),
		updatedAt: z.union([z.date(), z.string()]),
		qstashStatus: z.enum(["active", "missing"]),
		website: z
			.object({
				id: z.string(),
				name: z.string().nullable(),
				domain: z.string(),
			})
			.loose()
			.nullable()
			.optional(),
	})
	.loose();

const scheduleOutputSchema = z.record(z.string(), z.unknown());

const listScheduleItemSchema = getScheduleOutputSchema
	.omit({ qstashStatus: true })
	.loose();

export const uptimeRouter = {
	getScheduleByWebsiteId: monitorsProcedure
		.route({
			description: "Returns uptime schedule for a website.",
			method: "POST",
			path: "/uptime/getScheduleByWebsiteId",
			summary: "Get schedule by website",
			tags: ["Uptime"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(scheduleOutputSchema.nullable())
		.handler(async ({ context, input }) => {
			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.websiteId, input.websiteId),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});

			if (schedule) {
				await withWorkspace(context, {
					organizationId: schedule.organizationId,
					resource: "website",
					permissions: ["read"],
				});
			}

			return schedule ?? null;
		}),

	listSchedules: monitorsProcedure
		.route({
			description:
				"Returns uptime schedules for organization or all user workspaces.",
			method: "POST",
			path: "/uptime/listSchedules",
			summary: "List schedules",
			tags: ["Uptime"],
		})
		.input(
			z
				.object({
					organizationId: z.string().optional(),
				})
				.default({})
		)
		.output(z.array(listScheduleItemSchema))
		.handler(async ({ context, input }) => {
			const orgId = input.organizationId ?? context.organizationId;

			if (!orgId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId: orgId,
				resource: "website",
				permissions: ["read"],
			});

			return db.query.uptimeSchedules.findMany({
				where: eq(uptimeSchedules.organizationId, orgId),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
				with: { website: true },
				limit: 100,
			});
		}),

	getSchedule: monitorsProcedure
		.route({
			description: "Returns schedule with QStash status.",
			method: "POST",
			path: "/uptime/getSchedule",
			summary: "Get schedule",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(getScheduleOutputSchema)
		.handler(async ({ context, input }) => {
			const [dbSchedule, qstashSchedule] = await Promise.all([
				db.query.uptimeSchedules.findFirst({
					where: eq(uptimeSchedules.id, input.scheduleId),
					with: { website: true },
				}),
				client.schedules.get(input.scheduleId).catch(() => null),
			]);

			if (!dbSchedule) {
				throw rpcError.notFound("Schedule", input.scheduleId);
			}

			await withWorkspace(context, {
				organizationId: dbSchedule.organizationId,
				resource: "website",
				permissions: ["read"],
			});

			return {
				...dbSchedule,
				qstashStatus: qstashSchedule ? "active" : "missing",
			};
		}),

	createSchedule: monitorsProcedure
		.route({
			description:
				"Creates an uptime monitor. Requires workspace update permission.",
			method: "POST",
			path: "/uptime/createSchedule",
			summary: "Create schedule",
			tags: ["Uptime"],
		})
		.input(
			z.object({
				url: z.string().url(),
				name: z.string().optional(),
				organizationId: z.string().optional(),
				websiteId: z.string().optional(),
				granularity: granularityEnum,
				timeout: z.number().int().min(1000).max(120_000).optional(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId =
				input.organizationId?.trim() || context.organizationId || null;
			if (!organizationId) {
				throw rpcError.badRequest("Organization ID is required");
			}

			await withWorkspace(context, {
				organizationId,
				resource: "website",
				permissions: ["update"],
			});

			const existing = await db.query.uptimeSchedules.findFirst({
				where: and(
					eq(uptimeSchedules.url, input.url),
					eq(uptimeSchedules.organizationId, organizationId)
				),
			});

			if (existing) {
				throw rpcError.conflict(
					"Monitor already exists for this URL in this workspace"
				);
			}

			const scheduleId = randomUUIDv7();

			await db.insert(uptimeSchedules).values({
				id: scheduleId,
				organizationId,
				websiteId: input.websiteId ?? null,
				url: input.url,
				name: input.name ?? null,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: false,
				timeout: input.timeout ?? null,
				cacheBust: input.cacheBust ?? false,
				jsonParsingConfig: input.jsonParsingConfig ?? { enabled: true },
			});

			try {
				await createQStashSchedule(scheduleId, input.granularity);
			} catch (error) {
				await db
					.delete(uptimeSchedules)
					.where(eq(uptimeSchedules.id, scheduleId));
				logger.error({ scheduleId, error }, "QStash failed, rolled back");
				throw rpcError.internal("Failed to create monitor");
			}

			triggerInitialCheck(scheduleId);
			logger.info({ scheduleId, url: input.url }, "Schedule created");

			const created = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, scheduleId),
			});

			return {
				scheduleId,
				url: input.url,
				name: input.name,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				jsonParsingConfig: created?.jsonParsingConfig ?? null,
			};
		}),

	updateSchedule: monitorsProcedure
		.route({
			description: "Updates an uptime schedule. Requires update permission.",
			method: "POST",
			path: "/uptime/updateSchedule",
			summary: "Update schedule",
			tags: ["Uptime"],
		})
		.input(
			z.object({
				scheduleId: z.string(),
				name: z.string().nullish(),
				granularity: granularityEnum.optional(),
				timeout: z.number().int().min(1000).max(120_000).nullish(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			await getScheduleAndAuthorize(input.scheduleId, context);

			const updateData: {
				name?: string | null;
				granularity?: string;
				cron?: string;
				timeout?: number | null;
				cacheBust?: boolean;
				jsonParsingConfig?: { enabled: boolean };
				updatedAt: Date;
			} = {
				updatedAt: new Date(),
			};

			if (input.name !== undefined) {
				const trimmed = input.name?.trim();
				updateData.name = trimmed ? trimmed : null;
			}

			if (input.granularity) {
				await client.schedules.delete(input.scheduleId);
				await createQStashSchedule(input.scheduleId, input.granularity);
				updateData.granularity = input.granularity;
				updateData.cron = CRON_GRANULARITIES[input.granularity];
			}

			if (input.timeout !== undefined) {
				updateData.timeout = input.timeout;
			}

			if (input.cacheBust !== undefined) {
				updateData.cacheBust = input.cacheBust;
			}

			if (input.jsonParsingConfig !== undefined) {
				updateData.jsonParsingConfig = input.jsonParsingConfig;
			}

			await db
				.update(uptimeSchedules)
				.set(updateData)
				.where(eq(uptimeSchedules.id, input.scheduleId));

			logger.info({ scheduleId: input.scheduleId }, "Schedule updated");

			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.id, input.scheduleId),
			});

			return {
				scheduleId: input.scheduleId,
				name: schedule?.name ?? null,
				granularity: schedule?.granularity,
				cron: schedule?.cron,
				jsonParsingConfig: schedule?.jsonParsingConfig ?? null,
			};
		}),

	deleteSchedule: monitorsProcedure
		.route({
			description: "Deletes an uptime schedule. Requires update permission.",
			method: "POST",
			path: "/uptime/deleteSchedule",
			summary: "Delete schedule",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await getScheduleAndAuthorize(input.scheduleId, context);

			await Promise.all([
				client.schedules.delete(input.scheduleId),
				db
					.delete(uptimeSchedules)
					.where(eq(uptimeSchedules.id, input.scheduleId)),
			]);

			logger.info({ scheduleId: input.scheduleId }, "Schedule deleted");
			return { success: true };
		}),

	togglePause: monitorsProcedure
		.route({
			description: "Pauses or resumes an uptime schedule.",
			method: "POST",
			path: "/uptime/togglePause",
			summary: "Toggle pause",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string(), pause: z.boolean() }))
		.output(z.object({ success: z.literal(true), isPaused: z.boolean() }))
		.handler(async ({ context, input }) => {
			const schedule = await getScheduleAndAuthorize(input.scheduleId, context);

			if (schedule.isPaused === input.pause) {
				throw rpcError.badRequest(
					input.pause ? "Schedule is already paused" : "Schedule is not paused"
				);
			}

			try {
				await Promise.all([
					input.pause
						? client.schedules.pause({ schedule: input.scheduleId })
						: client.schedules.resume({ schedule: input.scheduleId }),
					db
						.update(uptimeSchedules)
						.set({ isPaused: input.pause, updatedAt: new Date() })
						.where(eq(uptimeSchedules.id, input.scheduleId)),
				]);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to toggle QStash schedule"
				);
				throw rpcError.internal("Failed to update monitor status");
			}

			logger.info(
				{ scheduleId: input.scheduleId, paused: input.pause },
				"Schedule toggled"
			);

			return { success: true, isPaused: input.pause };
		}),

	pauseSchedule: monitorsProcedure
		.route({
			description: "Pauses an uptime schedule. Legacy compatibility.",
			method: "POST",
			path: "/uptime/pauseSchedule",
			summary: "Pause schedule",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true), isPaused: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await getScheduleAndAuthorize(input.scheduleId, context);

			if (schedule.isPaused) {
				throw rpcError.badRequest("Schedule is already paused");
			}

			try {
				await Promise.all([
					client.schedules.pause({ schedule: input.scheduleId }),
					db
						.update(uptimeSchedules)
						.set({ isPaused: true, updatedAt: new Date() })
						.where(eq(uptimeSchedules.id, input.scheduleId)),
				]);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to pause"
				);
				throw rpcError.internal("Failed to pause monitor");
			}

			logger.info({ scheduleId: input.scheduleId }, "Schedule paused");
			return { success: true, isPaused: true };
		}),

	transfer: monitorsProcedure
		.route({
			description:
				"Transfers an uptime monitor to another organization. Requires update permission on source and create on target.",
			method: "POST",
			path: "/uptime/transfer",
			summary: "Transfer monitor",
			tags: ["Uptime"],
		})
		.input(
			z.object({
				scheduleId: z.string(),
				targetOrganizationId: z.string(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await getScheduleAndAuthorize(input.scheduleId, context);

			if (schedule.organizationId === input.targetOrganizationId) {
				throw rpcError.badRequest(
					"Monitor already belongs to this organization"
				);
			}

			await withWorkspace(context, {
				organizationId: input.targetOrganizationId,
				resource: "website",
				permissions: ["create"],
			});

			await db
				.update(uptimeSchedules)
				.set({
					organizationId: input.targetOrganizationId,
					updatedAt: new Date(),
				})
				.where(eq(uptimeSchedules.id, input.scheduleId));

			logger.info(
				{
					scheduleId: input.scheduleId,
					from: schedule.organizationId,
					to: input.targetOrganizationId,
				},
				"Monitor transferred"
			);

			return { success: true };
		}),

	manualCheck: monitorsProcedure
		.route({
			description:
				"Triggers an immediate uptime check for a monitor. Monitor must not be paused.",
			method: "POST",
			path: "/uptime/manualCheck",
			summary: "Manual check",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const schedule = await getScheduleAndAuthorize(input.scheduleId, context);

			if (schedule.isPaused) {
				throw rpcError.badRequest("Cannot trigger check on a paused monitor");
			}

			const rl = await ratelimit(`manual-check:${input.scheduleId}`, 5, 60);
			if (!rl.success) {
				throw rpcError.rateLimited(60);
			}

			try {
				await client.publish({
					urlGroup: UPTIME_URL_GROUP,
					headers: {
						"Content-Type": "application/json",
						"X-Schedule-Id": input.scheduleId,
					},
				});
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Manual check failed"
				);
				throw rpcError.internal("Failed to trigger check");
			}

			logger.info({ scheduleId: input.scheduleId }, "Manual check triggered");
			return { success: true };
		}),

	resumeSchedule: monitorsProcedure
		.route({
			description: "Resumes an uptime schedule. Legacy compatibility.",
			method: "POST",
			path: "/uptime/resumeSchedule",
			summary: "Resume schedule",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(z.object({ success: z.literal(true), isPaused: z.literal(false) }))
		.handler(async ({ context, input }) => {
			const schedule = await getScheduleAndAuthorize(input.scheduleId, context);

			if (!schedule.isPaused) {
				throw rpcError.badRequest("Schedule is not paused");
			}

			try {
				await Promise.all([
					client.schedules.resume({ schedule: input.scheduleId }),
					db
						.update(uptimeSchedules)
						.set({ isPaused: false, updatedAt: new Date() })
						.where(eq(uptimeSchedules.id, input.scheduleId)),
				]);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to resume"
				);
				throw rpcError.internal("Failed to resume monitor");
			}

			logger.info({ scheduleId: input.scheduleId }, "Schedule resumed");
			return { success: true, isPaused: false };
		}),
};
