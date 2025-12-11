import { db, eq, flagSchedules, flags } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { handleFlagUpdateDependencyCascading } from "@databuddy/shared/flags/utils";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });

export interface ExecutableSchedule {
    id: string;
    flagId: string;
    type: string;
    userId?: string;
    __isStep?: boolean;
    stepValue?: number | "enable" | "disable";
    stepScheduledAt?: string;
    rolloutSteps: { value: number | "enable" | "disable"; scheduledAt: string; executedAt?: string }[] | null;
}

export async function executeSchedule(sched: ExecutableSchedule) {
    try {
        const flag = await db.query.flags.findFirst({
            where: eq(flags.id, sched.flagId),
        });

        if (!flag) {
            await db.delete(flagSchedules).where(eq(flagSchedules.id, sched.id));
            return;
        }

        const updates: {
            updatedAt: Date;
            status?: "active" | "inactive";
            rolloutPercentage?: number;
        } = { updatedAt: new Date() };

        if (sched.__isStep) {
            const value = sched.stepValue;

            if (value === "enable") {
                updates.status = "active";
            } else if (value === "disable") {
                updates.status = "inactive";
            } else {
                updates.rolloutPercentage = Number(value);
            }
        } else {
            switch (sched.type) {
                case "enable":
                    updates.status = "active";
                    break;

                case "disable":
                    updates.status = "inactive";
                    break;
            }
        }

        const updatedFlag = (await db.update(flags).set(updates).where(eq(flags.id, sched.flagId)).returning())[0];

        if (sched.__isStep && sched.rolloutSteps) {
            const now = new Date();
            const nowIso = new Date().toISOString();
            const updatedRolloutSteps = sched.rolloutSteps.map((step) => {
                if (step.executedAt || new Date(step.scheduledAt) <= now) {
                    return { ...step, executedAt: step.executedAt || nowIso };
                }
                return step;
            });

            const allStepsExecuted = updatedRolloutSteps.every((step) => step.executedAt);

            await db.update(flagSchedules).set({
                rolloutSteps: updatedRolloutSteps,
                isEnabled: allStepsExecuted ? false : true,
                executedAt: allStepsExecuted ? new Date() : null
            }).where(eq(flagSchedules.id, sched.id));
        } else {
            await db.update(flagSchedules).set({ isEnabled: false, executedAt: new Date() }).where(eq(flagSchedules.id, sched.id));
        }

        if (updatedFlag) {
            await handleFlagUpdateDependencyCascading({ updatedFlag: updatedFlag, userId: sched.userId });
            await flagsCache.invalidateByTables(["flags"]);
        } else {
            logger.warn({ flagId: sched.flagId, scheduleId: sched.id }, "Failed to update flag, schedule not executed");
        }

        logger.info({
            scheduleId: sched.id,
            flagId: sched.flagId,
        }, "Executed schedule");
    } catch (err) {
        logger.error({ err, scheduleId: sched.id }, "Failed executing schedule");
    }
}