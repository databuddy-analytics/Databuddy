import { RolloutStep } from "@databuddy/shared/flags";
import { logger } from "@databuddy/shared/logger";
import { Client } from "@upstash/qstash";

if (!process.env.UPSTASH_QSTASH_TOKEN) {
    throw new Error("UPSTASH_QSTASH_TOKEN environment variable is required");
}

const client = new Client({
    token: process.env.UPSTASH_QSTASH_TOKEN,
});


const FLAG_SCHEDULER_DESTINATION =
    process.env.NEXT_PUBLIC_API_URL + "/webhooks/flag-scheduler"

export async function createQStashSchedule(
    scheduleId: string,
    scheduledAt: Date
): Promise<string> {
    try {

        const timestamp = Math.floor(scheduledAt.getTime() / 1000);

        const { messageId } = await client.publishJSON({
            url: FLAG_SCHEDULER_DESTINATION,
            body: { scheduleId },
            headers: {
                "Content-Type": "application/json",
                "X-Schedule-Id": scheduleId,
            },
            notBefore: timestamp,
        });

        if (!messageId) {
            throw new Error("Failed to create QStash schedule - no message ID returned");
        }

        logger.info(
            {
                scheduleId,
                qstashMessageId: messageId,
                scheduledAt: scheduledAt.toISOString(),
            },
            "Created QStash schedule for flag"
        );

        return messageId;
    } catch (error) {
        logger.error(
            {
                error,
                scheduleId,
                scheduledAt: scheduledAt.toISOString(),
            },
            "Failed to create QStash schedule"
        );
        throw error;
    }
}

export async function createQStashRolloutSchedule(
    scheduleId: string,
    rolloutSteps: RolloutStep[]
): Promise<string[]> {
    try {
        const messageIds = await Promise.all(rolloutSteps.map(async (step) => {
            const stepScheduledAt = new Date(step.scheduledAt);
            const timestamp = Math.floor(stepScheduledAt.getTime() / 1000);

            const { messageId } = await client.publishJSON({
                url: FLAG_SCHEDULER_DESTINATION,
                body: {
                    scheduleId,
                    stepScheduledAt: step.scheduledAt,
                    stepValue: step.value,
                },
                headers: {
                    "Content-Type": "application/json",
                    "X-Schedule-Id": scheduleId,
                    "X-Step-Scheduled-At": step.scheduledAt,
                },
                notBefore: timestamp,
            });

            if (!messageId) {
                throw new Error(`Failed to create QStash schedule for rollout step at ${step.scheduledAt}`);
            }

            return messageId;
        }));

        logger.info(
            {
                scheduleId,
                messageIds,
                stepCount: rolloutSteps.length,
            },
            "Created QStash schedules for rollout steps"
        );

        return messageIds;
    } catch (error) {
        logger.error(
            {
                error,
                scheduleId,
            },
            "Failed to create QStash rollout schedules"
        );
        throw error;
    }
}


export async function updateQStashSchedule(
    scheduleId: string,
    oldQStashScheduleId: string | null,
    scheduledAt: Date
): Promise<string> {
    // Delete old schedule if it exists
    if (oldQStashScheduleId) {
        try {
            await deleteQStashSchedule(oldQStashScheduleId);
        } catch (error) {
            logger.warn(
                { error, oldQStashScheduleId },
                "Failed to delete old QStash schedule during update"
            );
        }
    }

    // Create new schedule
    return createQStashSchedule(scheduleId, scheduledAt);
}

export async function updateQStashRolloutSchedule(
    scheduleId: string,
    oldQStashScheduleIds: string[] | string | null,
    rolloutSteps: RolloutStep[]
) {

    if (oldQStashScheduleIds) {
        const idsToDelete = Array.isArray(oldQStashScheduleIds)
            ? oldQStashScheduleIds
            : [oldQStashScheduleIds];

        for (const id of idsToDelete) {
            try {
                await deleteQStashSchedule(id);
            } catch (error) {
                logger.warn(
                    { error, qstashScheduleId: id },
                    "Failed to delete old QStash schedule during update"
                );
            }
        }
    }

    // Create new schedules for all steps
    return createQStashRolloutSchedule(scheduleId, rolloutSteps);
}

export async function deleteQStashSchedule(qstashScheduleId: string): Promise<void> {
    try {
        await client.schedules.delete(qstashScheduleId);
        logger.info({ qstashScheduleId }, "Deleted QStash schedule");
    } catch (error) {
        logger.error(
            {
                error,
                qstashScheduleId,
            },
            "Failed to delete QStash schedule"
        );
        throw error;
    }
}
