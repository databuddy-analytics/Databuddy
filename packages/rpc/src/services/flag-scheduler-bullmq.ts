import { Queue } from "bullmq";
import { logger } from "../lib/logger";

interface RolloutStep {
	executedAt?: string;
	scheduledAt: string;
	value: number | "enable" | "disable";
}

// Convert ioredis to BullMQ connection format
const getConnection = () => {
	const redisUrl = process.env.REDIS_URL;
	if (!redisUrl) {
		throw new Error("REDIS_URL environment variable is required");
	}

	const url = new URL(redisUrl);
	return {
		host: url.hostname,
		port: Number(url.port) || 6379,
		password: url.password || undefined,
		db: url.pathname ? Number(url.pathname.slice(1)) : undefined,
	};
};

const connection = getConnection();

// Create BullMQ queue for flag schedules
const flagScheduleQueue = new Queue("flag-schedules", {
	connection,
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: "exponential",
			delay: 2000,
		},
		removeOnComplete: {
			age: 24 * 3600, // Keep completed jobs for 24 hours
			count: 1000, // Keep max 1000 completed jobs
		},
		removeOnFail: {
			age: 7 * 24 * 3600, // Keep failed jobs for 7 days
		},
	},
});

export interface FlagScheduleJobData {
	flagId: string;
	scheduleId: string;
	stepScheduledAt?: string;
	stepValue?: number | "enable" | "disable";
	type: "enable" | "disable" | "update_rollout";
}

/**
 * Create a one-time scheduled job for enable/disable at a specific time
 */
export async function createBullMQSchedule(
	scheduleId: string,
	scheduledAt: Date,
	flagId: string,
	type: "enable" | "disable"
): Promise<string> {
	try {
		const delay = scheduledAt.getTime() - Date.now();

		if (delay <= 0) {
			throw new Error("Scheduled time must be in the future");
		}

		const job = await flagScheduleQueue.add(
			`schedule-${scheduleId}`,
			{
				scheduleId,
				type,
				flagId,
			} as FlagScheduleJobData,
			{
				delay,
				jobId: `flag-schedule-${scheduleId}`,
			}
		);

		if (!job.id) {
			throw new Error("Failed to create BullMQ schedule - no job ID returned");
		}

		logger.info(
			{
				scheduleId,
				bullmqJobId: job.id,
				scheduledAt: scheduledAt.toISOString(),
				delayMs: delay,
				type,
				flagId,
			},
			"Created BullMQ schedule for flag"
		);

		return job.id;
	} catch (error) {
		logger.error(
			{
				error,
				scheduleId,
				scheduledAt: scheduledAt.toISOString(),
			},
			"Failed to create BullMQ schedule"
		);
		throw error;
	}
}

/**
 * Create multiple one-time scheduled jobs for rollout steps
 */
export async function createBullMQRolloutSchedule(
	scheduleId: string,
	flagId: string,
	rolloutSteps: RolloutStep[]
): Promise<string[]> {
	try {
		const jobs = await Promise.allSettled(
			rolloutSteps.map(async (step) => {
				const stepScheduledAt = new Date(step.scheduledAt);
				const delay = stepScheduledAt.getTime() - Date.now();

				if (delay <= 0) {
					throw new Error(
						`Scheduled time must be in the future: ${step.scheduledAt}`
					);
				}

				const jobId = `flag-schedule-${scheduleId}-step-${step.scheduledAt}`;

				const job = await flagScheduleQueue.add(
					`schedule-${scheduleId}-step`,
					{
						scheduleId,
						type: "update_rollout",
						flagId,
						stepScheduledAt: step.scheduledAt,
						stepValue: step.value,
					} as FlagScheduleJobData,
					{
						delay,
						jobId,
					}
				);

				if (!job.id) {
					throw new Error(
						`Failed to create BullMQ schedule for rollout step at ${step.scheduledAt}`
					);
				}

				return job.id;
			})
		);

		const successes: string[] = [];
		const errors: unknown[] = [];

		for (const result of jobs) {
			if (result.status === "fulfilled") {
				successes.push(result.value);
			} else {
				errors.push(result.reason);
			}
		}

		if (errors.length > 0) {
			logger.error(
				{ errors, scheduleId },
				"Failed to create some BullMQ rollout schedules, cleaning up successful ones"
			);

			// Cleanup successful jobs since the batch failed
			await Promise.allSettled(
				successes.map(async (jobId) => {
					const job = await flagScheduleQueue.getJob(jobId);
					if (job) {
						await job.remove();
					}
				})
			);

			throw new Error(
				`Failed to create all rollout steps: ${errors.length} failed`
			);
		}

		logger.info(
			{
				scheduleId,
				jobIds: successes,
				stepCount: rolloutSteps.length,
			},
			"Created BullMQ schedules for rollout steps"
		);

		return successes;
	} catch (error) {
		logger.error(
			{
				error,
				scheduleId,
			},
			"Failed to create BullMQ rollout schedules"
		);
		throw error;
	}
}

/**
 * Update a scheduled job (delete old, create new)
 */
export async function updateBullMQSchedule(
	scheduleId: string,
	oldJobId: string | null,
	scheduledAt: Date,
	flagId: string,
	type: "enable" | "disable"
): Promise<string> {
	if (oldJobId) {
		try {
			await deleteBullMQSchedule(oldJobId);
		} catch (error) {
			logger.warn(
				{ error, oldJobId },
				"Failed to delete old BullMQ schedule during update"
			);
		}
	}

	// Create new job with updated data using the same function
	return createBullMQSchedule(scheduleId, scheduledAt, flagId, type);
}

/**
 * Update rollout schedule (delete old jobs, create new ones)
 */
export async function updateBullMQRolloutSchedule(
	scheduleId: string,
	oldJobIds: string[] | string | null,
	rolloutSteps: RolloutStep[],
	flagId: string
): Promise<string[]> {
	if (oldJobIds) {
		const idsToDelete = Array.isArray(oldJobIds) ? oldJobIds : [oldJobIds];

		await Promise.allSettled(
			idsToDelete.map(async (jobId) => {
				try {
					await deleteBullMQSchedule(jobId);
				} catch (error) {
					logger.warn(
						{ error, bullmqJobId: jobId },
						"Failed to delete old BullMQ schedule during update"
					);
				}
			})
		);
	}

	// Create new schedules for all steps
	return createBullMQRolloutSchedule(scheduleId, flagId, rolloutSteps);
}

/**
 * Delete a scheduled job
 */
export async function deleteBullMQSchedule(bullmqJobId: string): Promise<void> {
	try {
		const job = await flagScheduleQueue.getJob(bullmqJobId);
		if (job) {
			await job.remove();
			logger.info({ bullmqJobId }, "Deleted BullMQ schedule");
		} else {
			logger.warn(
				{ bullmqJobId },
				"Job not found when trying to delete BullMQ schedule"
			);
		}
	} catch (error) {
		logger.error(
			{
				error,
				bullmqJobId,
			},
			"Failed to delete BullMQ schedule"
		);
		throw error;
	}
}

/**
 * Get the BullMQ queue instance (for worker setup)
 */
export function getFlagScheduleQueue() {
	return flagScheduleQueue;
}
