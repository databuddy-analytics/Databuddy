import { websitesApi } from "@databuddy/auth";
import {
	and,
	db,
	eq,
	inArray,
	isNull,
	or,
	uptimeSchedules,
	websites,
} from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { Client } from "@upstash/qstash";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import {
	authorizeUptimeScheduleAccess,
	authorizeWebsiteAccess,
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
		websiteId: schedule.websiteId,
		userId: schedule.userId,
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

export const uptimeRouter = {
	getScheduleByWebsiteId: protectedProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");
			const schedule = await db.query.uptimeSchedules.findFirst({
				where: eq(uptimeSchedules.websiteId, input.websiteId),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});
			return schedule ?? null;
		}),

	listSchedules: protectedProcedure
		.input(
			z
				.object({
					websiteId: z.string().optional(),
					organizationId: z.string().optional(),
				})
				.default({})
		)
		.handler(async ({ context, input }) => {
			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "read");
				return await db.query.uptimeSchedules.findMany({
					where: eq(uptimeSchedules.websiteId, input.websiteId),
					orderBy: (table, { desc }) => [desc(table.createdAt)],
					with: { website: true },
				});
			}

			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: context.headers,
					body: { permissions: { website: ["read"] } },
				});
				if (!success) {
					throw new ORPCError("FORBIDDEN", {
						message: "Missing organization permissions.",
					});
				}

				// Get websites for this organization
				const orgWebsites = await db.query.websites.findMany({
					where: eq(websites.organizationId, input.organizationId),
					columns: { id: true },
				});

				const orgWebsiteIds = orgWebsites.map((w) => w.id);

				if (orgWebsiteIds.length === 0) {
					return [];
				}

				return await db.query.uptimeSchedules.findMany({
					where: inArray(uptimeSchedules.websiteId, orgWebsiteIds),
					orderBy: (table, { desc }) => [desc(table.createdAt)],
					with: { website: true },
				});
			}

			// Personal monitors only (no organizationId)
			// Get personal websites
			const personalWebsites = await db.query.websites.findMany({
				where: and(
					eq(websites.userId, context.user.id),
					isNull(websites.organizationId)
				),
				columns: { id: true },
			});

			const personalWebsiteIds = personalWebsites.map((w) => w.id);

			// Filter schedules:
			// 1. Personal monitors (no websiteId) created by user
			// 2. Monitors for personal websites
			const scheduleConditions = [
				and(
					eq(uptimeSchedules.userId, context.user.id),
					isNull(uptimeSchedules.websiteId)
				),
			];

			if (personalWebsiteIds.length > 0) {
				scheduleConditions.push(
					inArray(uptimeSchedules.websiteId, personalWebsiteIds)
				);
			}

			const conditions = [or(...scheduleConditions)];

			return await db.query.uptimeSchedules.findMany({
				where: and(...conditions),
				orderBy: (table, { desc }) => [desc(table.createdAt)],
				with: { website: true },
			});
		}),

	getSchedule: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
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
				websiteId: dbSchedule.websiteId,
				userId: dbSchedule.userId,
			});

			return {
				...dbSchedule,
				qstashStatus: qstashSchedule ? "active" : "missing",
			};
		}),

	createSchedule: protectedProcedure
		.input(
			z.object({
				url: z.string().url(),
				name: z.string().optional(),
				websiteId: z.string().optional(),
				granularity: granularityEnum,
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
						mode: z.enum(["auto", "manual"]),
						fields: z.array(z.string()).optional(),
					})
					.optional(),
			})
		)
		.handler(async ({ context, input }) => {
			if (input.websiteId) {
				await authorizeWebsiteAccess(context, input.websiteId, "update");
			}

			const existing = await db.query.uptimeSchedules.findFirst({
				where: and(
					eq(uptimeSchedules.url, input.url),
					eq(uptimeSchedules.userId, context.user.id),
					...(input.websiteId
						? [eq(uptimeSchedules.websiteId, input.websiteId)]
						: [])
				),
			});

			if (existing) {
				throw new ORPCError("CONFLICT", {
					message: input.websiteId
						? "Monitor already exists for this website"
						: "Monitor already exists for this URL",
				});
			}

			const scheduleId = input.websiteId || randomUUIDv7();

			await db.insert(uptimeSchedules).values({
				id: scheduleId,
				websiteId: input.websiteId ?? null,
				userId: context.user.id,
				url: input.url,
				name: input.name ?? null,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: false,
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
		.input(
			z.object({
				scheduleId: z.string(),
				granularity: granularityEnum.optional(),
				jsonParsingConfig: z
					.object({
						enabled: z.boolean(),
						mode: z.enum(["auto", "manual"]),
						fields: z.array(z.string()).optional(),
					})
					.optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await getScheduleAndAuthorize(input.scheduleId, context);

			const updateData: {
				granularity?: string;
				cron?: string;
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
		.input(z.object({ scheduleId: z.string() }))
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
		.input(z.object({ scheduleId: z.string(), pause: z.boolean() }))
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

	// Legacy endpoints for backwards compatibility
	pauseSchedule: protectedProcedure
		.input(z.object({ scheduleId: z.string() }))
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
		.input(z.object({ scheduleId: z.string() }))
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
};
