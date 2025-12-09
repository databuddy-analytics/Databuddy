import { db, eq, uptimeSchedules } from "@databuddy/db";
import { logger } from "@databuddy/shared/logger";
import { ORPCError } from "@orpc/server";
import { Client } from "@upstash/qstash";
import { z } from "zod";
import { recordORPCError } from "../lib/otel";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

if (!process.env.UPSTASH_QSTASH_TOKEN) {
	throw new Error("UPSTASH_QSTASH_TOKEN environment variable is required");
}

const client = new Client({
	token: process.env.UPSTASH_QSTASH_TOKEN,
});

const CRON_GRANULARITIES = {
	minute: "* * * * *",
	ten_minutes: "*/10 * * * *",
	thirty_minutes: "*/30 * * * *",
	hour: "0 * * * *",
	six_hours: "0 */6 * * *",
	twelve_hours: "0 */12 * * *",
	day: "0 0 * * *",
} as const;

const granularityEnum = z.enum([
	"minute",
	"ten_minutes",
	"thirty_minutes",
	"hour",
	"six_hours",
	"twelve_hours",
	"day",
]);

const UPTIME_DESTINATION =
	process.env.UPTIME_DESTINATION || "https://uptime.databuddy.cc";

async function findScheduleById(scheduleId: string) {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.id, scheduleId),
	});
	return schedule;
}

async function findScheduleByWebsiteId(websiteId: string) {
	const schedule = await db.query.uptimeSchedules.findFirst({
		where: eq(uptimeSchedules.websiteId, websiteId),
		orderBy: (table, { desc }) => [desc(table.createdAt)],
	});
	return schedule;
}

async function createQStashSchedule(
	websiteId: string,
	granularity: z.infer<typeof granularityEnum>
) {
	const { scheduleId } = await client.schedules.create({
		destination: UPTIME_DESTINATION,
		cron: CRON_GRANULARITIES[granularity],
		headers: {
			"Content-Type": "application/json",
			"X-Website-Id": websiteId,
		},
	});

	if (!scheduleId) {
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: "Failed to create uptime schedule",
		});
	}

	return scheduleId;
}

async function ensureNoDuplicateSchedule(
	websiteId: string,
	excludeScheduleId?: string
) {
	const schedules = await db.query.uptimeSchedules.findMany({
		where: eq(uptimeSchedules.websiteId, websiteId),
	});

	const conflictingSchedules = excludeScheduleId
		? schedules.filter((s) => s.id !== excludeScheduleId)
		: schedules;

	if (conflictingSchedules.length > 0) {
		throw new ORPCError("CONFLICT", {
			message:
				"A monitor already exists for this website. Please delete the existing monitor before creating a new one.",
		});
	}
}

export const uptimeRouter = {
	getScheduleByWebsiteId: protectedProcedure
		.input(
			z.object({
				websiteId: z.string().min(1, "Website ID is required"),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

			const schedule = await findScheduleByWebsiteId(input.websiteId);
			return schedule || null;
		}),

	getSchedule: protectedProcedure
		.input(
			z.object({
				scheduleId: z.string().min(1, "Schedule ID is required"),
			})
		)
		.handler(async ({ context, input }) => {
			const [dbSchedule, qstashSchedule] = await Promise.all([
				findScheduleById(input.scheduleId),
				client.schedules.get(input.scheduleId).catch(() => null),
			]);

			if (!(dbSchedule && qstashSchedule)) {
				recordORPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
				throw new ORPCError("NOT_FOUND", {
					message: "Schedule not found",
				});
			}

			await authorizeWebsiteAccess(context, dbSchedule.websiteId, "read");

			return {
				...dbSchedule,
				qstashStatus: qstashSchedule ? "active" : "missing",
			};
		}),

	createSchedule: protectedProcedure
		.input(
			z.object({
				websiteId: z.string().min(1, "Website ID is required"),
				granularity: granularityEnum,
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");
			await ensureNoDuplicateSchedule(input.websiteId);

			const scheduleId = await createQStashSchedule(
				input.websiteId,
				input.granularity
			);

			await db.insert(uptimeSchedules).values({
				id: scheduleId,
				websiteId: input.websiteId,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: false,
			});

			try {
				await client.publish({
					url: UPTIME_DESTINATION,
					headers: {
						"Content-Type": "application/json",
						"X-Website-Id": input.websiteId,
					},
				});
				logger.info(
					{
						scheduleId,
						websiteId: input.websiteId,
					},
					"Uptime schedule triggered manually after creation"
				);
			} catch (error) {
				logger.error(
					{
						scheduleId,
						websiteId: input.websiteId,
						error,
					},
					"Failed to trigger uptime schedule manually after creation"
				);
			}

			logger.info(
				{
					scheduleId,
					websiteId: input.websiteId,
					granularity: input.granularity,
					userId: context.user.id,
				},
				"Uptime schedule created"
			);

			return {
				scheduleId,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
			};
		}),

	updateSchedule: protectedProcedure
		.input(
			z.object({
				scheduleId: z.string().min(1, "Schedule ID is required"),
				granularity: granularityEnum,
			})
		)
		.handler(async ({ context, input }) => {
			const schedule = await findScheduleById(input.scheduleId);

			if (!schedule) {
				recordORPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
				throw new ORPCError("NOT_FOUND", {
					message: "Schedule not found",
				});
			}

			await authorizeWebsiteAccess(context, schedule.websiteId, "update");

			const otherSchedules = await db.query.uptimeSchedules.findMany({
				where: eq(uptimeSchedules.websiteId, schedule.websiteId),
			});

			if (
				otherSchedules.length > 1 ||
				(otherSchedules.length === 1 &&
					otherSchedules[0].id !== input.scheduleId)
			) {
				logger.warn(
					{
						scheduleId: input.scheduleId,
						websiteId: schedule.websiteId,
						foundSchedules: otherSchedules.map((s) => s.id),
					},
					"Multiple schedules found for website during update"
				);
			}

			try {
				await client.schedules.delete(input.scheduleId);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to delete old QStash schedule during update"
				);
				recordORPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete old QStash schedule",
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to delete old QStash schedule. Please try again.",
				});
			}

			await db
				.delete(uptimeSchedules)
				.where(eq(uptimeSchedules.id, input.scheduleId));

			const newScheduleId = await createQStashSchedule(
				schedule.websiteId,
				input.granularity
			);

			await db.insert(uptimeSchedules).values({
				id: newScheduleId,
				websiteId: schedule.websiteId,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
				isPaused: schedule.isPaused,
			});

			logger.info(
				{
					oldScheduleId: input.scheduleId,
					newScheduleId,
					websiteId: schedule.websiteId,
					granularity: input.granularity,
					userId: context.user.id,
				},
				"Uptime schedule updated"
			);

			return {
				scheduleId: newScheduleId,
				granularity: input.granularity,
				cron: CRON_GRANULARITIES[input.granularity],
			};
		}),

	deleteSchedule: protectedProcedure
		.input(
			z.object({
				scheduleId: z.string().min(1, "Schedule ID is required"),
			})
		)
		.handler(async ({ context, input }) => {
			const schedule = await findScheduleById(input.scheduleId);

			if (!schedule) {
				recordORPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
				throw new ORPCError("NOT_FOUND", {
					message: "Schedule not found",
				});
			}

			await authorizeWebsiteAccess(context, schedule.websiteId, "update");

			try {
				await client.schedules.delete(input.scheduleId);
			} catch (error) {
				logger.error(
					{ scheduleId: input.scheduleId, error },
					"Failed to delete QStash schedule"
				);
				recordORPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to delete QStash schedule",
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to delete QStash schedule. Please try again.",
				});
			}

			await db
				.delete(uptimeSchedules)
				.where(eq(uptimeSchedules.id, input.scheduleId));

			const verifyDeleted = await findScheduleById(input.scheduleId);
			if (verifyDeleted) {
				recordORPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to verify schedule deletion",
				});
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Failed to verify schedule deletion",
				});
			}

			logger.info(
				{
					scheduleId: input.scheduleId,
					websiteId: schedule.websiteId,
					userId: context.user.id,
				},
				"Uptime schedule deleted"
			);

			return { success: true, scheduleId: input.scheduleId };
		}),

	pauseSchedule: protectedProcedure
		.input(
			z.object({
				scheduleId: z.string().min(1, "Schedule ID is required"),
			})
		)
		.handler(async ({ context, input }) => {
			const schedule = await findScheduleById(input.scheduleId);

			if (!schedule) {
				recordORPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
				throw new ORPCError("NOT_FOUND", {
					message: "Schedule not found",
				});
			}

			await authorizeWebsiteAccess(context, schedule.websiteId, "update");

			if (schedule.isPaused) {
				recordORPCError({
					code: "BAD_REQUEST",
					message: "Schedule is already paused",
				});
				throw new ORPCError("BAD_REQUEST", {
					message: "Schedule is already paused",
				});
			}

			await Promise.all([
				client.schedules.pause({ schedule: input.scheduleId }),
				db
					.update(uptimeSchedules)
					.set({ isPaused: true, updatedAt: new Date() })
					.where(eq(uptimeSchedules.id, input.scheduleId)),
			]);

			logger.info(
				{
					scheduleId: input.scheduleId,
					websiteId: schedule.websiteId,
					userId: context.user.id,
				},
				"Uptime schedule paused"
			);

			return { success: true, scheduleId: input.scheduleId, isPaused: true };
		}),

	resumeSchedule: protectedProcedure
		.input(
			z.object({
				scheduleId: z.string().min(1, "Schedule ID is required"),
			})
		)
		.handler(async ({ context, input }) => {
			const schedule = await findScheduleById(input.scheduleId);

			if (!schedule) {
				recordORPCError({
					code: "NOT_FOUND",
					message: "Schedule not found",
				});
				throw new ORPCError("NOT_FOUND", {
					message: "Schedule not found",
				});
			}

			await authorizeWebsiteAccess(context, schedule.websiteId, "update");

			if (!schedule.isPaused) {
				recordORPCError({
					code: "BAD_REQUEST",
					message: "Schedule is not paused",
				});
				throw new ORPCError("BAD_REQUEST", {
					message: "Schedule is not paused",
				});
			}

			await Promise.all([
				client.schedules.resume({ schedule: input.scheduleId }),
				db
					.update(uptimeSchedules)
					.set({ isPaused: false, updatedAt: new Date() })
					.where(eq(uptimeSchedules.id, input.scheduleId)),
			]);

			logger.info(
				{
					scheduleId: input.scheduleId,
					websiteId: schedule.websiteId,
					userId: context.user.id,
				},
				"Uptime schedule resumed"
			);

			return { success: true, scheduleId: input.scheduleId, isPaused: false };
		}),
};
