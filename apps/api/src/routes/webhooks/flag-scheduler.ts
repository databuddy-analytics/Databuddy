import { db, eq, flagSchedules } from "@databuddy/db";
import { Elysia, t } from "elysia";
import { logger } from "@/lib/logger";
import { executeSchedule } from "@/services/flag-scheduler";

const webhookBodySchema = t.Object({
    scheduleId: t.String(),
    stepScheduledAt: t.Optional(t.String()),
    stepValue: t.Optional(t.Union([t.Number(), t.Literal("enable"), t.Literal("disable")])),
});

export const flagSchedulerWebhook = new Elysia({ prefix: "/webhooks/flag-scheduler" })
    .post(
        "/",
        async function handleFlagSchedulerWebhook({ body, request, set }) {
            try {
                const scheduleId = body.scheduleId || request.headers.get("X-Schedule-Id");
                if (!scheduleId) {
                    logger.warn("Missing schedule ID");
                    set.status = 400;
                    return { error: "Missing schedule ID" };
                }

                logger.info({ scheduleId, body }, "Processing flag schedule from QStash");

                const schedule = await db.query.flagSchedules.findFirst({
                    where: eq(flagSchedules.id, scheduleId),
                });

                if (!schedule) {
                    logger.warn({ scheduleId }, "Schedule not found");
                    set.status = 404;
                    return { error: "Schedule not found" };
                }

                if (!schedule.isEnabled) {
                    logger.info({ scheduleId }, "Schedule is disabled, skipping execution");
                    return { success: true, skipped: true, reason: "disabled" };
                }

                if (schedule.executedAt && schedule.type !== "update_rollout") {
                    logger.info({ scheduleId }, "Schedule already executed, skipping");
                    return { success: true, skipped: true, reason: "already_executed" };
                }

                if (schedule.type === "update_rollout" && body.stepScheduledAt && body.stepValue !== undefined) {
                    const stepAlreadyExecuted = schedule.rolloutSteps?.some(
                        (step: any) => step.scheduledAt === body.stepScheduledAt && step.executedAt
                    );

                    if (stepAlreadyExecuted) {
                        logger.info({ scheduleId, stepScheduledAt: body.stepScheduledAt }, "Rollout step already executed, skipping");
                        return { success: true, skipped: true, reason: "step_already_executed" };
                    }

                    await executeSchedule({
                        ...schedule,
                        __isStep: true,
                        stepValue: body.stepValue,
                        stepScheduledAt: body.stepScheduledAt,
                    } as any);
                } else {
                    await executeSchedule(schedule as any);
                }

                logger.info({ scheduleId }, "Flag schedule executed successfully");

                return { success: true, scheduleId };
            } catch (error) {
                logger.error({ error }, "Failed to process flag schedule webhook");
                set.status = 500;
                return { error: "Internal server error" };
            }
        },
        {
            body: webhookBodySchema,
        }
    )
    .get("/health", () => ({
        service: "flag-scheduler-webhook",
        status: "ok",
        timestamp: new Date().toISOString(),
    }));
