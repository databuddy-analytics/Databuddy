import { and, db, eq, flagSchedules, flags, lte, isNotNull, inArray, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";
import { handleFlagUpdateDependencyCascading } from "@databuddy/shared/flags/utils";

const flagsCache = createDrizzleCache({ redis, namespace: "flags" });

export function startFlagScheduler() {
    logger.info("Starting flag scheduler...");

    processSchedules();
    setInterval(processSchedules, 60 * 1000);
}

async function processSchedules() {
    try {
        console.log('Processing Schedules');

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

            for (const step of sched.rolloutSteps) {
                if (new Date(step.scheduledAt) <= now) {
                    dueSteps.push({
                        ...sched,
                        __isStep: true,
                        stepValue: step.value,
                        stepScheduledAt: step.scheduledAt,
                    });
                }
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

async function executeSchedule(sched: any) {
    try {
        const flag = await db.query.flags.findFirst({
            where: eq(flags.id, sched.flagId),
        });

        if (!flag) {
            logger.warn("Flag not found for schedule", sched.flagId);
            await db.delete(flagSchedules).where(eq(flagSchedules.id, sched.id));
            return;
        }

        const updates: any = { updatedAt: new Date() };

        if (sched.__isStep) {
            const value = sched.stepValue;

            if (value === "enable") {
                updates.status = "active";
                // updates.defaultValue = true;
            } else if (value === "disable") {
                updates.status = "inactive";
                // updates.defaultValue = false;
            } else {
                updates.rolloutPercentage = Number(value);
            }
        }

        else {
            switch (sched.type) {
                case "enable":
                    updates.status = "active";
                    // updates.defaultValue = true;
                    break;

                case "disable":
                    updates.status = "inactive";
                    // updates.defaultValue = false;
                    break;
            }
        }
        const updatedFlag = (await db.update(flags).set(updates).where(eq(flags.id, sched.flagId)).returning())[0];
        await db.update(flagSchedules).set({ isEnabled: false, executedAt: new Date() }).where(eq(flagSchedules.id, sched.id));

        if (updatedFlag) {
            await handleFlagUpdateDependencyCascading({ updatedFlag: updatedFlag, userId: sched.userId });
            await flagsCache.invalidateByTables(["flags"]);
        } else {
            logger.warn({ flagId: sched.flagId, scheduleId: sched.id }, "Failed to update flag, schedule not executed",);
        }

        logger.info({
            scheduleId: sched.id,
            flagId: sched.flagId,
        }, "Executed schedule");
    } catch (err) {
        logger.error({ err, scheduleId: sched.id }, "Failed executing schedule");
    }
}