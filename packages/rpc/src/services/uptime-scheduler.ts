import {
	getUptimeQueue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeImmediateJobId,
	uptimeSchedulerId,
} from "@databuddy/redis/uptime-queue";
import { logger } from "../lib/logger";

export const CRON_GRANULARITIES = {
	minute: "* * * * *",
	five_minutes: "*/5 * * * *",
	ten_minutes: "*/10 * * * *",
	thirty_minutes: "*/30 * * * *",
	hour: "0 * * * *",
	six_hours: "0 */6 * * *",
	twelve_hours: "0 */12 * * *",
	day: "0 0 * * *",
} as const;

export type UptimeGranularity = keyof typeof CRON_GRANULARITIES;

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
