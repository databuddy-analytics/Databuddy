import { db, eq, flagSchedules } from "@databuddy/db";
import { Elysia } from "elysia";
import { logger } from "@/lib/logger";
import { executeSchedule } from "@/services/flag-scheduler";
import { Receiver } from "@upstash/qstash";


export const flagSchedulerWebhook = new Elysia({ prefix: "/webhooks/flag-scheduler" })
    .post(
        "/",
        async function handleFlagSchedulerWebhook({ request, set }) {
            try {
                const receiver = new Receiver({
                    currentSigningKey: process.env.UPSTASH_QSTASH_CURRENT_SIGNING_KEY!,
                    nextSigningKey: process.env.UPSTASH_QSTASH_NEXT_SIGNING_KEY!,
                });

                const signature = request.headers.get("Upstash-Signature");
                if (!signature) {
                    set.status = 401;
                    return { error: "Missing Webhook Signature" };
                }

                const rawBody = await request.text();

                const FLAG_SCHEDULER_DESTINATION =
                    process.env.NEXT_PUBLIC_API_URL + "/webhooks/flag-scheduler"

                logger.info({
                    verificationUrl: FLAG_SCHEDULER_DESTINATION,
                    hasSignature: !!signature,
                    bodyLength: rawBody.length,
                }, "Verifying QStash signature");

                const isValid = await receiver.verify({
                    body: rawBody,
                    signature,
                    url: FLAG_SCHEDULER_DESTINATION
                });


                if (!isValid) {
                    logger.warn("Invalid signature");
                    set.status = 401;
                    return { error: "Invalid signature" };
                }

                const body = JSON.parse(rawBody) as {
                    scheduleId: string;
                    stepScheduledAt?: string;
                    stepValue?: number | "enable" | "disable";
                };

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
                        (step) => step.scheduledAt === body.stepScheduledAt && step.executedAt
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
                    });
                } else {
                    await executeSchedule(schedule);
                }

                logger.info({ scheduleId }, "Flag schedule executed successfully");

                return { success: true, scheduleId };
            } catch (error) {
                logger.error({ error }, "Failed to process flag schedule webhook");
                set.status = 500;
                return { error: "Internal server error" };
            }
        }
    )
    .get("/health", () => ({
        service: "flag-scheduler-webhook",
        status: "ok",
        timestamp: new Date().toISOString(),
    }));
