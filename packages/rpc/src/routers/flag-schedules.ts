import { randomUUID } from "node:crypto";
import { and, desc, eq, flagSchedules, flags, isNull } from "@databuddy/db";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

type FlagScheduleType = "enable" | "disable" | "update_rollout";

type DbRolloutStep = {
    scheduledAt: string;
    executedAt?: string;
    value: number | "enable" | "disable";
};

const rolloutStepSchema = z.object({
    scheduledAt: z.string(),
    executedAt: z.string().optional(),
    value: z.union([
        z.number().min(0).max(100),
        z.literal("enable"),
        z.literal("disable"),
    ]),
});

const flagScheduleSchema = z.object({
    id: z.string().optional(),
    isEnabled: z.boolean(),
    flagId: z.string(),
    type: z.enum(["enable", "disable", "update_rollout"]),
    scheduledAt: z.string().optional(),
    rolloutSteps: z.array(rolloutStepSchema).optional(),
});

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

            const [schedule] = await context.db
                .insert(flagSchedules)
                .values({
                    id: randomUUID(),
                    flagId: input.flagId,
                    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                    type: input.type,
                    isEnabled: input.isEnabled,
                    rolloutSteps: input.rolloutSteps?.map((step) => ({
                        ...step,
                        executedAt: undefined,
                    })),
                })
                .returning();

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
                .set(updateData)
                .where(eq(flagSchedules.id, id))
                .returning();

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

            await context.db
                .delete(flagSchedules)
                .where(eq(flagSchedules.id, input.id));
            return { success: true };
        }),
};
