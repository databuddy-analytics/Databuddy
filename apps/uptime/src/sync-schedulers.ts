import { db, eq } from "@databuddy/db";
import { uptimeSchedules } from "@databuddy/db/schema";
import {
	getUptimeQueue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeSchedulerId,
} from "@databuddy/redis";
import {
	CRON_GRANULARITIES,
	parseUptimeGranularity,
} from "@databuddy/shared/uptime";
import { log } from "evlog";

export async function syncSchedulers(): Promise<void> {
	const queue = getUptimeQueue();
	const monitors = await db
		.select({
			id: uptimeSchedules.id,
			granularity: uptimeSchedules.granularity,
		})
		.from(uptimeSchedules)
		.where(eq(uptimeSchedules.isPaused, false));

	let upserted = 0;
	let failed = 0;

	for (const monitor of monitors) {
		const granularity = parseUptimeGranularity(monitor.granularity);
		const pattern = granularity ? CRON_GRANULARITIES[granularity] : null;
		try {
			if (!pattern) {
				throw new Error(`Unknown granularity: ${monitor.granularity}`);
			}
			await queue.upsertJobScheduler(
				uptimeSchedulerId(monitor.id),
				{ pattern },
				{
					name: UPTIME_CHECK_JOB_NAME,
					data: { scheduleId: monitor.id, trigger: "scheduled" },
					opts: UPTIME_JOB_OPTIONS,
				}
			);
			upserted += 1;
		} catch (error) {
			failed += 1;
			log.error({
				sync: "scheduler",
				schedule_id: monitor.id,
				error_message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	log.info({
		sync: "scheduler",
		total: monitors.length,
		upserted,
		failed,
	});
}
