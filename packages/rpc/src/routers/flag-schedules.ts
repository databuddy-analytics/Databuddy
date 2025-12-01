import { randomUUID } from "node:crypto";
import { and, desc, eq, flagSchedules, flags, isNull } from "@databuddy/db";
import { flagScheduleSchema } from "@databuddy/shared/flags";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

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
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
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
            console.log({ flag });

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

            const updateData: any = { ...updates, updatedAt: new Date() };
            if (updates.scheduledAt) {
                updateData.scheduledAt = new Date(updates.scheduledAt);
            }
            updateData.executedAt = null;
            updates.rolloutSteps?.forEach((step, i) => {
                updateData.rolloutSteps[i].executedAt = null;
                updateData.rolloutSteps[i].scheduledAt = new Date(step.scheduledAt);
            });

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
            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, input.id),
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

            await context.db
                .delete(flagSchedules)
                .where(eq(flagSchedules.id, input.id));

            return { success: true };
        }),
};
