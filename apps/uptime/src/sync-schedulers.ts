import { db, eq } from "@databuddy/db";
import { uptimeSchedules } from "@databuddy/db/schema";
import {
	getUptimeQueue,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_OPTIONS,
	uptimeSchedulerId,
} from "@databuddy/redis";
import { Cause, Data, Effect, Exit, Ref } from "effect";
import { log } from "evlog";

const CRON_GRANULARITIES: Record<string, string> = {
	minute: "* * * * *",
	five_minutes: "*/5 * * * *",
	ten_minutes: "*/10 * * * *",
	thirty_minutes: "*/30 * * * *",
	hour: "0 * * * *",
	six_hours: "0 */6 * * *",
	twelve_hours: "0 */12 * * *",
	day: "0 0 * * *",
};

class UnknownGranularity extends Data.TaggedError("UnknownGranularity")<{
	scheduleId: string;
	granularity: string;
}> {}

const syncMonitor = (
	monitor: { id: string; granularity: string },
	queue: ReturnType<typeof getUptimeQueue>
) =>
	Effect.gen(function* () {
		const schedulerId = uptimeSchedulerId(monitor.id);

		const existing = yield* Effect.tryPromise({
			try: () => queue.getJobScheduler(schedulerId),
			catch: (cause) => cause,
		});
		if (existing) {
			return "skipped" as const;
		}

		const pattern = CRON_GRANULARITIES[monitor.granularity];
		if (!pattern) {
			return yield* Effect.fail(
				new UnknownGranularity({
					scheduleId: monitor.id,
					granularity: monitor.granularity,
				})
			);
		}

		yield* Effect.tryPromise({
			try: () =>
				queue.upsertJobScheduler(
					schedulerId,
					{ pattern },
					{
						name: UPTIME_CHECK_JOB_NAME,
						data: {
							scheduleId: monitor.id,
							trigger: "scheduled" as const,
						},
						opts: UPTIME_JOB_OPTIONS,
					}
				),
			catch: (cause) => cause,
		});

		return "created" as const;
	});

const syncAll = Effect.gen(function* () {
	const queue = getUptimeQueue();

	const monitors = yield* Effect.tryPromise({
		try: () =>
			db
				.select({
					id: uptimeSchedules.id,
					granularity: uptimeSchedules.granularity,
				})
				.from(uptimeSchedules)
				.where(eq(uptimeSchedules.isPaused, false)),
		catch: (cause) => cause,
	});

	const created = yield* Ref.make(0);
	const skipped = yield* Ref.make(0);
	const failed = yield* Ref.make(0);

	for (const monitor of monitors) {
		yield* syncMonitor(monitor, queue).pipe(
			Effect.tap((result) =>
				result === "created"
					? Ref.update(created, (n) => n + 1)
					: Ref.update(skipped, (n) => n + 1)
			),
			Effect.catch((error) => {
				if (error instanceof UnknownGranularity) {
					log.error({
						sync: "scheduler",
						schedule_id: error.scheduleId,
						error_message: `Unknown granularity: ${error.granularity}`,
					});
					return Ref.update(failed, (n) => n + 1);
				}

				log.error({
					sync: "scheduler",
					schedule_id: monitor.id,
					error_message: error instanceof Error ? error.message : String(error),
				});
				return Ref.update(failed, (n) => n + 1);
			})
		);
	}

	const [c, s, f] = yield* Effect.all([
		Ref.get(created),
		Ref.get(skipped),
		Ref.get(failed),
	]);

	log.info({
		sync: "scheduler",
		total: monitors.length,
		created: c,
		skipped: s,
		failed: f,
	});
});

export async function syncSchedulers(): Promise<void> {
	const exit = await Effect.runPromiseExit(syncAll);
	if (Exit.isFailure(exit)) {
		throw Cause.squash(exit.cause);
	}
}
