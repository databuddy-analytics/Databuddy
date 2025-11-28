import { randomUUID } from "node:crypto";
import { and, desc, eq, flagSchedules, flags, isNull } from "@databuddy/db";
import { createFlagScheduleSchema } from "@databuddy/shared/types/flags";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

export const flagSchedulesRouter = {
    getByFlagId: protectedProcedure
        .input(z.object({ flagId: z.string() }))
        .handler(async ({ context, input }) => {

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
        .input(createFlagScheduleSchema)
        .handler(async ({ context, input }) => {

            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, input.flagId),
            });

            if (!flag) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }

            if (flag.websiteId) {
                await authorizeWebsiteAccess(context, flag.websiteId, "update");
            }

            const [schedule] = await context.db
                .insert(flagSchedules)
                .values({
                    id: randomUUID(),
                    flagId: input.flagId,
                    scheduledAt: input.scheduledAt ? new input,
                    timezone: input.timezone,
                    action: input.action,
                    value: input.value,
                    createdBy: context.user.id,
                })
                .returning();

            return schedule;
        }),

    update: protectedProcedure
        .input(createFlagScheduleSchema)
        .handler(async ({ context, input }) => {
            const existingSchedule = await context.db.query.flagSchedules.findFirst({
                where: eq(flagSchedules.id, input.id),
                with: {
                    // We need to join with flags to check permissions, but drizzle query builder 
                    // might be easier with a separate fetch if relations aren't set up perfectly in schema types for query builder
                }
            });

            if (!existingSchedule) {
                throw new ORPCError("NOT_FOUND", { message: "Schedule not found" });
            }

            // Verify access via flag
            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, existingSchedule.flagId),
            });

            if (!flag) {
                throw new ORPCError("NOT_FOUND", { message: "Flag not found" });
            }

            if (flag.websiteId) {
                await authorizeWebsiteAccess(context, flag.websiteId, "update");
            }

            const { id, ...updates } = input;

            const updateData: any = { ...updates, updatedAt: new Date() };
            if (updates.scheduledAt) {
                updateData.scheduledAt = new Date(updates.scheduledAt);
            }

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

            // Verify access via flag
            const flag = await context.db.query.flags.findFirst({
                where: eq(flags.id, existingSchedule.flagId),
            });

            if (flag && flag.websiteId) {
                await authorizeWebsiteAccess(context, flag.websiteId, "update");
            }

            await context.db
                .delete(flagSchedules)
                .where(eq(flagSchedules.id, input.id));

            return { success: true };
        }),
};
