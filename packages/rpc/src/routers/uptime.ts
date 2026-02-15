import { and, db, eq, inArray, member, uptimeSchedules, alarms, uptimeAlarmHistory, desc } from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { Client } from "@upstash/qstash";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import {
	authorizeUptimeScheduleAccess,
	checkOrgPermission,
} from "../utils/auth";

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
	context: Parameters<typeof authorizeUptimeScheduleAccess>[0]
) {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.id, scheduleId),
	});

	if (!schedule) {
		throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
	}

	await authorizeUptimeScheduleAccess(context, {
		organizationId: schedule.organizationId,
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

const scheduleOutputSchema = z.record(z.string(), z.unknown());

export const uptimeRouter = {
	getScheduleByWebsiteId: protectedProcedure
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
				await authorizeUptimeScheduleAccess(context, {
					organizationId: schedule.organizationId,
				});
			}

			return schedule ?? null;
		}),

	listSchedules: protectedProcedure
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
		.output(z.array(scheduleOutputSchema))
		.handler(async ({ context, input }) => {
			if (input.organizationId) {
				await checkOrgPermission(
					context,
					input.organizationId,
					"website",
					"read",
					"Missing workspace permissions."
				);

				return await db.query.uptimeSchedules.findMany({
					where: eq(uptimeSchedules.organizationId, input.organizationId),
					orderBy: (table, { desc }) => [desc(table.createdAt)],
					with: { website: true },
				});
			}

			const userMemberships = await db.query.member.findMany({
				where: eq(member.userId, context.user.id),
				columns: { organizationId: true },
			});
			const orgIds = userMemberships.map((m) => m.organizationId);

			if (orgIds.length === 0) {
				return [];
			}

			return await db.query.uptimeSchedules.findMany({
				where: inArray(uptimeSchedules.organizationId, orgIds),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
				with: { website: true },
			});
		}),

	getSchedule: protectedProcedure
		.route({
			description: "Returns schedule with QStash status.",
			method: "POST",
			path: "/uptime/getSchedule",
			summary: "Get schedule",
			tags: ["Uptime"],
		})
		.input(z.object({ scheduleId: z.string() }))
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			const [dbSchedule, qstashSchedule] = await Promise.all([
				db.query.uptimeSchedules.findFirst({
					where: eq(uptimeSchedules.id, input.scheduleId),
					with: { website: true },
				}),
				client.schedules.get(input.scheduleId).catch(() => null),
			]);

			if (!dbSchedule) {
				throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
			}

			await authorizeUptimeScheduleAccess(context, {
				organizationId: dbSchedule.organizationId,
			});

			return {
				...dbSchedule,
				qstashStatus: qstashSchedule ? "active" : "missing",
			};
		}),

	createSchedule: protectedProcedure
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
				organizationId: z.string(),
				websiteId: z.string().optional(),
				granularity: granularityEnum,
				timeout: z.number().int().min(1000).max(120_000).optional(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
						mode: z.enum(["auto", "manual"]),
						fields: z.array(z.string()).optional(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			await checkOrgPermission(
				context,
				input.organizationId,
				"website",
				"update",
				"Missing workspace permissions."
			);

			const existing = await db.query.uptimeSchedules.findFirst({
				where: and(
					eq(uptimeSchedules.url, input.url),
					eq(uptimeSchedules.organizationId, input.organizationId)
				),
			});

			if (existing) {
				throw new ORPCError("CONFLICT", {
					message: "Monitor already exists for this URL in this workspace",
				});
			}

			const scheduleId = randomUUIDv7();

			await db.insert(uptimeSchedules).values({
				id: scheduleId,
				organizationId: input.organizationId,
				websiteId: input.websiteId ?? null,
				url: input.url,
				name: input.name ?? null,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: false,
				timeout: input.timeout ?? null,
				cacheBust: input.cacheBust ?? false,
				jsonParsingConfig: input.jsonParsingConfig ?? null,
			});

			try {
				await createQStashSchedule(scheduleId, input.granularity);
			} catch (error) {
				await db
					.delete(uptimeSchedules)
					.where(eq(uptimeSchedules.id, scheduleId));
				logger.error({ scheduleId, error }, "QStash failed, rolled back");
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to create monitor",
				});
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

	updateSchedule: protectedProcedure
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
				granularity: granularityEnum.optional(),
				timeout: z.number().int().min(1000).max(120_000).nullish(),
				cacheBust: z.boolean().optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
						mode: z.enum(["auto", "manual"]),
						fields: z.array(z.string()).optional(),
					})
					.optional(),
			})
		)
		.output(scheduleOutputSchema)
		.handler(async ({ context, input }) => {
			await getScheduleAndAuthorize(input.scheduleId, context);

			const updateData: {
				granularity?: string;
				cron?: string;
				timeout?: number | null;
				cacheBust?: boolean;
				jsonParsingConfig?: unknown;
				updatedAt: Date;
			} = {
				updatedAt: new Date(),
			};

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
				granularity: schedule?.granularity,
				cron: schedule?.cron,
				jsonParsingConfig: schedule?.jsonParsingConfig ?? null,
			};
		}),

	deleteSchedule: protectedProcedure
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

	togglePause: protectedProcedure
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
				throw new ORPCError("BAD_REQUEST", {
					message: input.pause
						? "Schedule is already paused"
						: "Schedule is not paused",
				});
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to update monitor status",
				});
			}

			logger.info(
				{ scheduleId: input.scheduleId, paused: input.pause },
				"Schedule toggled"
			);

			return { success: true, isPaused: input.pause };
		}),

	pauseSchedule: protectedProcedure
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
				throw new ORPCError("BAD_REQUEST", {
					message: "Schedule is already paused",
				});
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to pause monitor",
				});
			}

			logger.info({ scheduleId: input.scheduleId }, "Schedule paused");
			return { success: true, isPaused: true };
		}),

	resumeSchedule: protectedProcedure
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
				throw new ORPCError("BAD_REQUEST", {
					message: "Schedule is not paused",
				});
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
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to resume monitor",
				});
			}

			logger.info({ scheduleId: input.scheduleId }, "Schedule resumed");
			return { success: true, isPaused: false };
			}),
				assignAlarms: protectedProcedure
					.input(
						z.object({
							uptimeMonitorId: z.string(),
							alarmIds: z.array(z.string()),
						})
					)
					.handler(async ({ input, context }) => {
						await context.db
							.update(uptimeSchedules)
							.set({ alarmIds: input.alarmIds })
							.where(eq(uptimeSchedules.id, input.uptimeMonitorId));

						return { success: true };
					}),
				getAssignedAlarms: protectedProcedure
					.input(z.object({ uptimeMonitorId: z.string() }))
					.handler(async ({ input, context }) => {
						const schedule = await context.db.query.uptimeSchedules.findFirst({
							where: eq(uptimeSchedules.id, input.uptimeMonitorId),
						});

						if (!schedule || !schedule.alarmIds) {
							return [];
						}

						return await context.db.query.alarms.findMany({
							where: member(alarms.id, schedule.alarmIds),
						});
					}),
				getAlarmHistory: protectedProcedure
					.input(
						z.object({
							uptimeMonitorId: z.string(),
							limit: z.number().default(50),
						})
					)
					.handler(async ({ input, context }) => {
						return await context.db.query.uptimeAlarmHistory.findMany({
							where: eq(uptimeAlarmHistory.uptimeMonitorId, input.uptimeMonitorId),
							orderBy: desc(uptimeAlarmHistory.triggeredAt),
							limit: input.limit,
						});
					}),
		}),
};
