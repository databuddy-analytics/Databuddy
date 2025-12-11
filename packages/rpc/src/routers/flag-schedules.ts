import { randomUUID } from "node:crypto";
import { and, desc, eq, flagSchedules, flags, isNull } from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";
import { flagScheduleSchema, FlagScheduleType } from "@databuddy/shared/flags";
import { logger } from "@databuddy/shared/logger";
import {
    createQStashSchedule,
    createQStashRolloutSchedule,
    deleteQStashSchedule,
    updateQStashSchedule,
    updateQStashRolloutSchedule,
} from "@/services/flag-scheduler";


type DbRolloutStep = {
    scheduledAt: string;
    executedAt?: string;
    value: number | "enable" | "disable";
};

interface FlagScheduleUpdateData {
    flagId: string;
    type: FlagScheduleType;
    isEnabled: boolean;
    scheduledAt?: Date | null;
    rolloutSteps?: DbRolloutStep[];
    executedAt: null;
    updatedAt: Date;
}

export const flagSchedulesRouter = {
    getByFlagId: protectedProcedure
        .input(z.object({ flagId: z.string() }))
        .handler(async ({ context, input }) => {
            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, input.flagId),
            });

            if (!flag?.websiteId) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }


            await authorizeWebsiteAccess(context, flag.websiteId, "read");

            const schedules = await context.db
                .select()
                .from(flagSchedules)
                .where(eq(flagSchedules.flagId, input.flagId))
                .orderBy(desc(flagSchedules.scheduledAt));


            if (!schedules[0]) {
                throw new ORPCError("NOT_FOUND", { message: "No schedules found for this flag" });
            }

            return schedules[0];
        }),

    create: protectedProcedure
        .input(flagScheduleSchema)
        .handler(async ({ context, input }) => {

            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, input.flagId),
            });

            if (!flag?.websiteId) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }

            await authorizeWebsiteAccess(context, flag.websiteId, "update");

            const scheduleId = randomUUID();
            let qstashScheduleIds: string[] | null = null;

            try {
                if (input.type === "update_rollout" && input.rolloutSteps) {
                    qstashScheduleIds = await createQStashRolloutSchedule(scheduleId, input.rolloutSteps);
                } else if (input.scheduledAt) {
                    const messageId = await createQStashSchedule(scheduleId, new Date(input.scheduledAt));
                    qstashScheduleIds = [messageId]; // Store as array for consistency
                }
            } catch (error) {
                logger.error({ error, scheduleId, input }, "Failed to create QStash schedule");
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to create schedule in QStash",
                    data: error
                });
            }

            const [schedule] = await context.db
                .insert(flagSchedules)
                .values({
                    id: scheduleId,
                    flagId: input.flagId,
                    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                    type: input.type,
                    isEnabled: input.isEnabled,
                    qstashScheduleIds,
                    rolloutSteps: input.rolloutSteps?.map((step) => ({
                        ...step,
                        executedAt: undefined,
                    })),
                })
                .returning();

            logger.info(
                {
                    scheduleId,
                    qstashScheduleIds,
                    flagId: input.flagId,
                    type: input.type,
                    userId: context.user.id,
                },
                "Flag schedule created"
            );

            return schedule;
        }),

    update: protectedProcedure
        .input(flagScheduleSchema)
        .handler(async ({ context, input }) => {
            if (!input.id) {
                throw new ORPCError("BAD_REQUEST", { message: "Schedule ID is required" });
            }

            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, input.flagId),
            });

            if (!flag?.websiteId) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }

            await authorizeWebsiteAccess(context, flag.websiteId, "update");

            const existingSchedule = await context.db.query.flagSchedules.findFirst({
                where: eq(flagSchedules.id, input.id),
            });

            if (!existingSchedule) {
                throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
            }

            const { id, ...updates } = input;

            let qstashScheduleIds: string[] | null = existingSchedule.qstashScheduleIds;
            try {
                if (input.type === "update_rollout" && input.rolloutSteps) {
                    qstashScheduleIds = await updateQStashRolloutSchedule(
                        input.id,
                        existingSchedule.qstashScheduleIds,
                        input.rolloutSteps
                    );
                } else if (input.scheduledAt) {
                    const messageId = await updateQStashSchedule(
                        input.id,
                        existingSchedule.qstashScheduleIds?.[0] || null,
                        new Date(input.scheduledAt)
                    );
                    qstashScheduleIds = [messageId]; // Store as array for consistency
                }
            } catch (error) {
                logger.error({ error, scheduleId: input.id, input }, "Failed to update QStash schedule");
                throw new ORPCError("INTERNAL_SERVER_ERROR", {
                    message: "Failed to update schedule in QStash",
                });
            }

            const updateData: FlagScheduleUpdateData = {
                ...updates,
                updatedAt: new Date(),
                executedAt: null,
                scheduledAt: updates.scheduledAt ? new Date(updates.scheduledAt) : null,
                rolloutSteps: updates.rolloutSteps?.map((step) => ({
                    value: step.value,
                    scheduledAt: step.scheduledAt,
                    executedAt: undefined,
                })),
            };

            const [updated] = await context.db
                .update(flagSchedules)
                .set({ ...updateData, qstashScheduleIds })
                .where(eq(flagSchedules.id, id))
                .returning();

            logger.info(
                {
                    scheduleId: id,
                    qstashScheduleIds,
                    flagId: input.flagId,
                    userId: context.user.id,
                },
                "Flag schedule updated"
            );

            return updated;
        }),

    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .handler(async ({ context, input }) => {
            const existingSchedule = await context.db.query.flagSchedules.findFirst({
                where: eq(flagSchedules.id, input.id),
            });
            if (!existingSchedule) {
                throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
            }

            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, existingSchedule.flagId),
            });
            if (!flag?.websiteId) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }

            await authorizeWebsiteAccess(context, flag.websiteId, "update");

            // Delete QStash schedules if they exist
            if (existingSchedule.qstashScheduleIds) {
                for (const id of existingSchedule.qstashScheduleIds) {
                    try {
                        await deleteQStashSchedule(id);
                    } catch (error) {
                        logger.error(
                            { error, scheduleId: input.id, qstashScheduleIds: id },
                            "Failed to delete QStash schedule"
                        );
                        // Continue with database deletion even if QStash deletion fails
                    }
                }
            }

            await context.db
                .delete(flagSchedules)
                .where(eq(flagSchedules.id, input.id));

            logger.info(
                {
                    scheduleId: input.id,
                    qstashScheduleIds: existingSchedule.qstashScheduleIds,
                    flagId: existingSchedule.flagId,
                    userId: context.user.id,
                },
                "Flag schedule deleted"
            );

            return { success: true };
        }),
};
