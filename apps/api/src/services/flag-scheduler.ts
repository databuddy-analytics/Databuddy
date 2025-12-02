import { and, db, eq, flagSchedules, flags, lte, isNotNull, inArray, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { handleFlagUpdateDependencyCascading } from "@databuddy/shared/flags/utils";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });

let schedulerInterval: NodeJS.Timeout | null = null;

export function startFlagScheduler() {
    logger.info("Starting flag scheduler...");

    processSchedules();
    schedulerInterval = setInterval(processSchedules, 60 * 1000);
}

export function stopFlagScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        logger.info("Flag scheduler stopped");
    }
}

async function processSchedules() {
    try {
        logger.debug("Processing schedules");

        const now = new Date();

        const dueSingleSchedules = await db
            .select()
            .from(flagSchedules)
            .where(
                and(
                    isNotNull(flagSchedules.scheduledAt),
                    lte(flagSchedules.scheduledAt, now),
                    inArray(flagSchedules.type, ['enable', 'disable']),
                    eq(flagSchedules.isEnabled, true),
                    isNull(flagSchedules.executedAt)
                )
            );

        const rolloutSchedules = await db.select().from(flagSchedules).where(
            and(
                isNotNull(flagSchedules.rolloutSteps),
                isNull(flagSchedules.scheduledAt),
                eq(flagSchedules.type, "update_rollout"),
                eq(flagSchedules.isEnabled, true),
                isNull(flagSchedules.executedAt)
            )
        );

        const dueSteps = [];

        for (const sched of rolloutSchedules) {
            if (!sched.rolloutSteps || sched.rolloutSteps.length === 0) continue;

            const dueStepsForSchedule = sched.rolloutSteps
                .filter((step: any) => new Date(step.scheduledAt) <= now && !step.executedAt)
                .sort((a: any, b: any) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());

            const latestStep = dueStepsForSchedule?.[0];
            if (latestStep) {
                dueSteps.push({
                    ...sched,
                    __isStep: true,
                    stepValue: latestStep.value,
                    stepScheduledAt: latestStep.scheduledAt,
                });
            }
        }

        const toExecute = [...dueSingleSchedules, ...dueSteps];

        if (toExecute.length === 0) return;

        logger.info(`Executing ${toExecute.length} pending schedules...`);

        for (const sched of toExecute) {

            await executeSchedule(sched);
        }
    } catch (err) {
        logger.error({ err }, "Error running flag scheduler");
    }
}

interface ExecutableSchedule {
    id: string;
    flagId: string;
    type: string;
    userId?: string;
    __isStep?: boolean;
    stepValue?: string | number;
    stepScheduledAt?: string;
    rolloutSteps: { value: string | number; scheduledAt: string; executedAt?: string }[] | null;
}

async function executeSchedule(sched: ExecutableSchedule) {
    try {
        const flag = await db.query.flags.findFirst({
            where: eq(flags.id, sched.flagId),
        });

        if (!flag) {
            await db.delete(flagSchedules).where(eq(flagSchedules.id, sched.id));
            return;
        }

        const updates: any = { updatedAt: new Date() };

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
            const updatedRolloutSteps = sched.rolloutSteps.map((step: any) => {
                if (step.executedAt || new Date(step.scheduledAt) <= now) {
                    return { ...step, executedAt: step.executedAt || new Date().toISOString() };
                }
                return step;
            });

            const allStepsExecuted = updatedRolloutSteps.every((step: any) => step.executedAt);

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