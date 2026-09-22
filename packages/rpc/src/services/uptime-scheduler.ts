import {
	getUptimeQueue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeImmediateJobId,
	uptimeSchedulerId,
} from "@databuddy/redis/uptime-queue";
import {
	CRON_GRANULARITIES,
	type UptimeGranularity,
} from "@databuddy/shared/uptime";
import { logger } from "../lib/logger";

export async function upsertUptimeSchedule(
	scheduleId: string,
	granularity: UptimeGranularity
): Promise<void> {
	const queue = getUptimeQueue();
	const pattern = CRON_GRANULARITIES[granularity];

	await queue.upsertJobScheduler(
		uptimeSchedulerId(scheduleId),
		{ pattern },
		{
			name: UPTIME_CHECK_JOB_NAME,
			data: { scheduleId, trigger: "scheduled" },
			opts: UPTIME_JOB_OPTIONS,
		}
	);

	logger.info({ scheduleId, granularity, pattern }, "Uptime schedule upserted");
}

export async function removeUptimeSchedule(scheduleId: string): Promise<void> {
	const removed = await getUptimeQueue().removeJobScheduler(
		uptimeSchedulerId(scheduleId)
	);

	logger.info({ scheduleId, removed }, "Uptime schedule removed");
}

export async function hasUptimeSchedule(scheduleId: string): Promise<boolean> {
	const scheduler = await getUptimeQueue().getJobScheduler(
		uptimeSchedulerId(scheduleId)
	);
	return Boolean(scheduler);
}

export async function enqueueUptimeCheck(scheduleId: string): Promise<void> {
	await getUptimeQueue().add(
		UPTIME_CHECK_JOB_NAME,
		{ scheduleId, trigger: "manual" },
		{
			jobId: uptimeImmediateJobId(scheduleId),
		}
	);

	logger.info({ scheduleId, trigger: "manual" }, "Uptime check enqueued");
}
