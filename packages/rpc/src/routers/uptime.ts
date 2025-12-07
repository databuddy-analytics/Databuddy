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

export const uptimeRouter = {
    getSchedule: protectedProcedure
        .input(
            z.object({
                scheduleId: z.string().min(1, "Schedule ID is required"),
            })
        )
        .handler(async ({ context, input }) => {
            try {
                const [dbSchedule, qstashSchedule] = await Promise.all([
                    db.query.uptimeSchedules.findFirst({
                        where: eq(uptimeSchedules.id, input.scheduleId),
                    }),
                    client.schedules.get(input.scheduleId).catch(() => null),
                ]);

                if (!(dbSchedule && qstashSchedule)) {
                    recordORPCError({
                        code: "NOT_FOUND",
                        message: "Schedule not found in database",
                    });
                    throw new ORPCError("NOT_FOUND", {
                        message: "Schedule not found in database",
                    });
                }

                await authorizeWebsiteAccess(context, dbSchedule.websiteId, "read");

                return {
                    ...dbSchedule,
                    qstashStatus: qstashSchedule ? "active" : "missing",
                };
            } catch (error) {
                if (error instanceof ORPCError) {
                    throw error;
                }
                logger.error(
                    { scheduleId: input.scheduleId, error },
                    "Error fetching schedule"
                );
                recordORPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to fetch schedule",
                });
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to fetch schedule",
                });
            }
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

            try {
                const { scheduleId } = await client.schedules.create({
                    destination: UPTIME_DESTINATION,
                    cron: CRON_GRANULARITIES[input.granularity],
                    body: JSON.stringify({ websiteId: input.websiteId }),
                });

                if (!scheduleId) {
                    recordORPCError({
                        code: "INTERNAL_SERVER_ERROR",
                        message: "Failed to create uptime schedule",
                    });
                    throw new ORPCError("INTERNAL_SERVER_ERROR", {
                        message: "Failed to create uptime schedule",
                    });
                }

                await db.insert(uptimeSchedules).values({
                    id: scheduleId,
                    websiteId: input.websiteId,
                    granularity: input.granularity,
                    cron: CRON_GRANULARITIES[input.granularity],
                    isPaused: false,
                });

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
            } catch (error) {
                logger.error(
                    { websiteId: input.websiteId, error },
                    "Error creating schedule"
                );
                recordORPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to create uptime schedule",
                });
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to create uptime schedule",
                });
            }
        }),

    deleteSchedule: protectedProcedure
        .input(
            z.object({
                scheduleId: z.string().min(1, "Schedule ID is required"),
            })
        )
        .handler(async ({ context, input }) => {
            try {
                const schedule = await db.query.uptimeSchedules.findFirst({
                    where: eq(uptimeSchedules.id, input.scheduleId),
                });

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

                const [qstashResult] = await Promise.allSettled([
                    client.schedules.delete(input.scheduleId),
                    db
                        .delete(uptimeSchedules)
                        .where(eq(uptimeSchedules.id, input.scheduleId)),
                ]);

                if (qstashResult.status === "rejected") {
                    logger.error(
                        { scheduleId: input.scheduleId, error: qstashResult.reason },
                        "Failed to delete QStash schedule"
                    );
                }

                const verifyDeleted = await db.query.uptimeSchedules.findFirst({
                    where: eq(uptimeSchedules.id, input.scheduleId),
                });

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
            } catch (error) {
                if (error instanceof ORPCError) {
                    throw error;
                }
                logger.error(
                    { scheduleId: input.scheduleId, error },
                    "Error deleting schedule"
                );
                recordORPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to delete schedule",
                });
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to delete schedule",
                });
            }
        }),

    pauseSchedule: protectedProcedure
        .input(
            z.object({
                scheduleId: z.string().min(1, "Schedule ID is required"),
            })
        )
        .handler(async ({ context, input }) => {
            try {
                const schedule = await db.query.uptimeSchedules.findFirst({
                    where: eq(uptimeSchedules.id, input.scheduleId),
                });

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
            } catch (error) {
                if (error instanceof ORPCError) {
                    throw error;
                }
                logger.error(
                    { scheduleId: input.scheduleId, error },
                    "Error pausing schedule"
                );
                recordORPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to pause schedule",
                });
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to pause schedule",
                });
            }
        }),

    resumeSchedule: protectedProcedure
        .input(
            z.object({
                scheduleId: z.string().min(1, "Schedule ID is required"),
            })
        )
        .handler(async ({ context, input }) => {
            try {
                const schedule = await db.query.uptimeSchedules.findFirst({
                    where: eq(uptimeSchedules.id, input.scheduleId),
                });

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
            } catch (error) {
                if (error instanceof ORPCError) {
                    throw error;
                }
                logger.error(
                    { scheduleId: input.scheduleId, error },
                    "Error resuming schedule"
                );
                recordORPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to resume schedule",
                });
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to resume schedule",
                });
            }
        }),
};
