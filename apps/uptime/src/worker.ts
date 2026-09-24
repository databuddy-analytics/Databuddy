import { randomUUID } from "node:crypto";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	getBullMQWorkerConnectionOptions,
	getUptimeDeliveryQueue,
	getUptimeQueue,
	redis,
	type UptimeCheckJobData,
	type UptimeDeliveryJobData,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_DELIVERY_JOB_OPTIONS,
	UPTIME_DELIVERY_QUEUE_NAME,
	UPTIME_JOB_OPTIONS,
	UPTIME_QUEUE_NAME,
	UPTIME_WORKER_LOCK_MS,
	UPTIME_WORKER_MAX_STALLED_COUNT,
	UPTIME_WORKER_STALLED_INTERVAL_MS,
	uptimeDeliveryJobId,
	uptimeSchedulerId,
} from "@databuddy/redis";
import { DelayedError, type Job, Worker } from "bullmq";
import { createLogger, log, type RequestLogger } from "evlog";
import { Cause, Data, Effect, Exit } from "effect";
import {
	checkUptime,
	DEFAULT_TIMEOUT,
	isTimedOut,
	lookupSchedule,
	type ScheduleData,
	ScheduleLookupError,
} from "./actions";
import { sendUptimeEvent } from "./lib/producer";
import { captureError } from "./lib/tracing";
import {
	MonitorStatus,
	type ScheduleLookupReason,
	uptimeCheckJobDataSchema,
	uptimeDataSchema,
	uptimeDeliveryJobDataSchema,
	type UptimeData,
} from "./types";
import {
	fireTransitionAlerts,
	getPreviousMonitorState,
	type MonitorStateLookup,
	writeMonitorState,
} from "./uptime-transition-alerts";

class PreviousStateUnavailable extends Data.TaggedError(
	"PreviousStateUnavailable"
)<{
	message: string;
}> {}

class DeliveryHandoffFailed extends Data.TaggedError("DeliveryHandoffFailed")<{
	message: string;
}> {}

const REAPABLE_REASONS: ReadonlySet<ScheduleLookupReason> = new Set([
	"not_found",
	"malformed",
]);

const CHECK_LOCK_PREFIX = "uptime:check-lock:";
const CHECK_LOCK_MARGIN_MS = 30_000;
const RELEASE_CHECK_LOCK_SCRIPT =
	'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) end return 0';

const uptimeWorkerDeps = {
	acquireCheckLock: async (
		scheduleId: string,
		ttlMs: number
	): Promise<string | null> => {
		const token = randomUUID();
		const result = await redis.set(
			`${CHECK_LOCK_PREFIX}${scheduleId}`,
			token,
			"PX",
			ttlMs,
			"NX"
		);
		return result === "OK" ? token : null;
	},
	captureError,
	checkUptime,
	createLogger: (
		fields: Record<string, string | number | boolean>
	): RequestLogger => createLogger(fields),
	enqueueUptimeDelivery: async (data: UptimeData) => {
		await getUptimeDeliveryQueue().add(
			UPTIME_DELIVERY_QUEUE_NAME,
			{ event: data },
			{ jobId: uptimeDeliveryJobId(data.event_id) }
		);
	},
	fireTransitionAlerts,
	getPreviousMonitorState,
	lookupSchedule,
	reapScheduler: async (scheduleId: string) => {
		await getUptimeQueue().removeJobScheduler(uptimeSchedulerId(scheduleId));
	},
	releaseCheckLock: async (scheduleId: string, token: string) => {
		await redis.eval(
			RELEASE_CHECK_LOCK_SCRIPT,
			1,
			`${CHECK_LOCK_PREFIX}${scheduleId}`,
			token
		);
	},
	sendUptimeEvent,
	setMonitorState: writeMonitorState,
};

export type UptimeWorkerDeps = typeof uptimeWorkerDeps;

const DEFAULT_UPTIME_WORKER_CONCURRENCY = 25;
const CHECK_ATTEMPTS = 3;
const DEFAULT_CHECK_RETRY_DELAY_MS = 2000;

function checkRetryDelayMs(): number {
	const value = Number(
		process.env.UPTIME_CHECK_RETRY_DELAY_MS ?? DEFAULT_CHECK_RETRY_DELAY_MS
	);
	return Number.isFinite(value) && value >= 0
		? value
		: DEFAULT_CHECK_RETRY_DELAY_MS;
}

function uptimeWorkerConcurrency(): number {
	const parsed = Number.parseInt(
		process.env.UPTIME_WORKER_CONCURRENCY ?? "",
		10
	);
	return Number.isSafeInteger(parsed) && parsed > 0
		? parsed
		: DEFAULT_UPTIME_WORKER_CONCURRENCY;
}

function checkLockTtlMs(timeout: number | null): number {
	return (
		(timeout ?? DEFAULT_TIMEOUT) * CHECK_ATTEMPTS +
		checkRetryDelayMs() * (CHECK_ATTEMPTS - 1) +
		CHECK_LOCK_MARGIN_MS
	);
}

type UptimeWorkerJob = Pick<
	Job<UptimeCheckJobData>,
	"attemptsMade" | "data" | "id" | "name" | "updateData"
>;

type UptimeDeliveryWorkerJob = Pick<
	Job<UptimeDeliveryJobData>,
	"attemptsMade" | "data" | "id" | "name" | "moveToDelayed"
>;

const timed = <A, E>(
	label: string,
	effect: Effect.Effect<A, E>,
	log: RequestLogger
) =>
	Effect.gen(function* () {
		const t = performance.now();
		const result = yield* effect;
		log.set({ [`timing.${label}`]: Math.round(performance.now() - t) });
		return result;
	});

const runCheck = (
	monitorId: string,
	schedule: ScheduleData,
	deps: UptimeWorkerDeps
) =>
	Effect.gen(function* () {
		const options = {
			timeout: schedule.timeout ?? undefined,
			cacheBust: schedule.cacheBust,
		};
		let data = yield* deps.checkUptime(monitorId, schedule.url, 1, options);
		for (
			let attempt = 2;
			data.status !== MonitorStatus.UP &&
			!isTimedOut(data) &&
			attempt <= CHECK_ATTEMPTS;
			attempt++
		) {
			yield* Effect.sleep(checkRetryDelayMs());
			data = yield* deps.checkUptime(monitorId, schedule.url, attempt, options);
		}
		return data;
	});

export function resolveFailureStreak(
	status: number,
	previous: MonitorStateLookup | null
): number {
	if (status !== MonitorStatus.DOWN) {
		return 0;
	}
	return previous?.kind === "found" &&
		previous.state.status === MonitorStatus.DOWN
		? previous.state.failureStreak + 1
		: 1;
}

const handoffDelivery = (
	data: UptimeData,
	handoff: () => Promise<void>,
	errorStep: "uptime_delivery_checkpoint" | "uptime_delivery_enqueue",
	deps: UptimeWorkerDeps
) =>
	Effect.tryPromise({
		try: handoff,
		catch: (cause) => {
			deps.captureError(cause, {
				error_step: errorStep,
				event_id: data.event_id,
			});
			return new DeliveryHandoffFailed({ message: String(cause) });
		},
	});

const admitDelivery = (
	data: UptimeData,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	timed(
		"delivery_queue_admission",
		handoffDelivery(
			data,
			() => deps.enqueueUptimeDelivery(data),
			"uptime_delivery_enqueue",
			deps
		),
		log
	).pipe(
		Effect.tap(() =>
			Effect.sync(() => log.set({ delivery_queue_admitted: true }))
		)
	);

const runTransitionAlerts = (
	schedule: ScheduleData,
	data: UptimeData,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	timed(
		"transition_email",
		Effect.promise(() =>
			deps.fireTransitionAlerts({ schedule, data }).then(
				(transition) => {
					if (transition.transition_kind) {
						log.set({
							transition_kind: transition.transition_kind,
							alarms_fired: transition.alarms_fired,
						});
					}
				},
				(error: unknown) => {
					deps.captureError(error, {
						error_step: "transition_alerts",
						schedule_id: schedule.id,
					});
					log.set({
						transition_alert_error:
							error instanceof Error ? error.message : "unknown",
					});
				}
			)
		),
		log
	);

function reapScheduler(
	scheduleId: string,
	reason: ScheduleLookupReason | "paused",
	deps: UptimeWorkerDeps,
	log: RequestLogger
): void {
	deps
		.reapScheduler(scheduleId)
		.then(() => {
			log.set({ orphan_scheduler_reaped: true });
		})
		.catch((cause) => {
			log.set({
				orphan_scheduler_reaped: false,
				orphan_scheduler_reap_error:
					cause instanceof Error ? cause.message : String(cause),
			});
			deps.captureError(cause, {
				error_step: "reap_orphan_scheduler",
				schedule_id: scheduleId,
				schedule_lookup_reason: reason,
			});
		});
}

const runLockedCheck = (
	schedule: ScheduleData,
	monitorId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
	checkpoint: (data: UptimeData) => Promise<void>
) =>
	Effect.gen(function* () {
		const checked = yield* timed(
			"check_uptime",
			runCheck(monitorId, schedule, deps),
			log
		).pipe(
			Effect.tapError((e) =>
				Effect.sync(() =>
					log.set({ outcome: "check_failed", error_message: e.message })
				)
			)
		);

		const previousState =
			checked.status === MonitorStatus.DOWN
				? yield* timed(
						"previous_status",
						Effect.tryPromise({
							try: () => deps.getPreviousMonitorState(monitorId),
							catch: (cause) =>
								new PreviousStateUnavailable({ message: String(cause) }),
						}).pipe(
							Effect.filterOrFail(
								(state) => state.kind !== "unavailable",
								() =>
									new PreviousStateUnavailable({
										message: `Previous monitor state unavailable for ${monitorId}`,
									})
							)
						),
						log
					).pipe(
						Effect.tapError((e) =>
							Effect.sync(() =>
								log.set({
									outcome: "previous_state_unavailable",
									error_message: e.message,
								})
							)
						)
					)
				: null;

		const data: UptimeData = {
			...checked,
			failure_streak: resolveFailureStreak(checked.status, previousState),
		};

		log.set({
			event_id: data.event_id,
			outcome: data.status === MonitorStatus.UP ? "up" : "down",
			previous_state_source: previousState?.kind ?? "skipped",
			previous_uptime_status:
				previousState?.kind === "found" ? previousState.state.status : -1,
			monitor_status: data.status,
			check_attempt: data.attempt,
			check_retries: data.retries,
			failure_streak: data.failure_streak,
			http_code: data.http_code,
			total_ms: data.total_ms,
			ttfb_ms: data.ttfb_ms,
			probe_region: data.probe_region,
			ssl_valid: data.ssl_valid === 1,
			ssl_expiry: data.ssl_expiry,
			response_bytes: data.response_bytes,
			redirect_count: data.redirect_count,
			error_message: data.error || "",
		});

		// Persist the completed probe before admission. A source-job retry then
		// reuses its event ID and timestamp instead of running a replacement check.
		yield* timed(
			"delivery_checkpoint",
			handoffDelivery(
				data,
				() => checkpoint(data),
				"uptime_delivery_checkpoint",
				deps
			),
			log
		);

		yield* timed(
			"monitor_state_persist",
			Effect.promise(() =>
				deps
					.setMonitorState(monitorId, {
						failureStreak: data.failure_streak,
						status: data.status,
					})
					.catch((cause: unknown) => {
						deps.captureError(cause, {
							error_step: "monitor_state_persist",
							event_id: data.event_id,
						});
					})
			),
			log
		);

		yield* admitDelivery(data, deps, log);
		yield* runTransitionAlerts(schedule, data, deps, log);
	});

const processCheck = (
	scheduleId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
	checkpoint: (data: UptimeData) => Promise<void>
) =>
	Effect.gen(function* () {
		const schedule = yield* timed(
			"lookup_schedule",
			deps.lookupSchedule(scheduleId),
			log
		).pipe(
			Effect.tapError((e) =>
				Effect.sync(() => {
					log.set({
						outcome: "schedule_not_found",
						error_message: e.message,
						schedule_lookup_reason: e.reason,
					});
					if (REAPABLE_REASONS.has(e.reason)) {
						reapScheduler(scheduleId, e.reason, deps, log);
					} else {
						deps.captureError(e, {
							error_step: "lookup_schedule",
							reason: e.reason,
						});
					}
				})
			)
		);

		log.set({
			organization_id: schedule.organizationId,
			schedule_timeout_ms: schedule.timeout ?? 0,
			schedule_cache_bust: schedule.cacheBust,
		});

		if (schedule.isPaused) {
			log.set({ outcome: "skipped_paused" });
			reapScheduler(scheduleId, "paused", deps, log);
			return;
		}

		const monitorId = schedule.websiteId || scheduleId;

		log.set({
			monitor_id: monitorId,
			check_url: schedule.url,
			...(schedule.websiteId ? { website_id: schedule.websiteId } : {}),
		});

		const lockToken = yield* Effect.promise(() =>
			deps
				.acquireCheckLock(scheduleId, checkLockTtlMs(schedule.timeout))
				.catch((cause: unknown) => {
					deps.captureError(cause, {
						error_step: "check_lock_acquire",
						schedule_id: scheduleId,
					});
					log.set({ check_lock_unavailable: true });
					return;
				})
		);
		if (lockToken === null) {
			log.set({ outcome: "skipped_overlap" });
			return;
		}

		yield* runLockedCheck(schedule, monitorId, log, deps, checkpoint).pipe(
			Effect.ensuring(
				lockToken === undefined
					? Effect.void
					: Effect.promise(() =>
							deps
								.releaseCheckLock(scheduleId, lockToken)
								.catch((cause: unknown) => {
									deps.captureError(cause, {
										error_step: "check_lock_release",
										schedule_id: scheduleId,
									});
								})
						)
			)
		);
	});

const replayDelivery = (
	scheduleId: string,
	data: UptimeData,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	Effect.gen(function* () {
		yield* admitDelivery(data, deps, log);
		const schedule = yield* deps.lookupSchedule(scheduleId).pipe(
			Effect.catch((error) =>
				Effect.sync(() => {
					log.set({
						transition_alert_skipped: true,
						transition_alert_skip_reason: error.message,
					});
					return null;
				})
			)
		);
		if (schedule) {
			yield* runTransitionAlerts(schedule, data, deps, log);
		}
	});

export async function processUptimeJob(
	job: UptimeWorkerJob,
	deps: UptimeWorkerDeps = uptimeWorkerDeps
) {
	if (job.name !== UPTIME_CHECK_JOB_NAME) {
		throw new Error(`Unknown uptime job: ${job.name}`);
	}

	const parsedJobData = uptimeCheckJobDataSchema.safeParse(job.data);
	if (!parsedJobData.success) {
		throw new Error("Invalid uptime job payload");
	}

	const jobData = parsedJobData.data;
	const persisted =
		jobData.delivery && uptimeDataSchema.safeParse(jobData.delivery.event);
	if (persisted && !persisted.success) {
		throw new Error("Invalid persisted uptime delivery payload");
	}
	const replayEvent = persisted?.data;

	const startedAt = performance.now();
	const log = deps.createLogger({
		schedule_id: jobData.scheduleId,
		uptime_trigger: jobData.trigger,
		...(replayEvent
			? { event_id: replayEvent.event_id, delivery_replay: true }
			: {}),
		...(job.id ? { job_id: job.id } : {}),
		...(job.attemptsMade ? { job_attempt: job.attemptsMade } : {}),
	});

	const exit = await Effect.runPromiseExit<void, unknown>(
		replayEvent
			? replayDelivery(jobData.scheduleId, replayEvent, deps, log)
			: processCheck(jobData.scheduleId, log, deps, async (data) => {
					await job.updateData({ ...jobData, delivery: { event: data } });
				})
	);

	log.set({
		[replayEvent ? "delivery_replay_duration_ms" : "check_duration_ms"]:
			Math.round(performance.now() - startedAt),
	});
	log.emit();

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		if (
			error instanceof ScheduleLookupError &&
			REAPABLE_REASONS.has(error.reason)
		) {
			return;
		}
		throw new Error(error instanceof Error ? error.message : String(error));
	}
}

export async function processUptimeDeliveryJob(
	job: UptimeDeliveryWorkerJob,
	deps: UptimeWorkerDeps = uptimeWorkerDeps,
	token?: string
): Promise<void> {
	if (job.name !== UPTIME_DELIVERY_QUEUE_NAME) {
		throw new Error(`Unknown uptime delivery job: ${job.name}`);
	}

	const parsedJobData = uptimeDeliveryJobDataSchema.safeParse(job.data);
	if (!parsedJobData.success) {
		throw new Error("Invalid uptime delivery job payload");
	}

	const parsedEvent = uptimeDataSchema.safeParse(parsedJobData.data.event);
	if (!parsedEvent.success) {
		throw new Error("Invalid uptime delivery payload");
	}

	const { event_id: eventId, ...event } = parsedEvent.data;
	try {
		await deps.sendUptimeEvent(event, event.site_id);
	} catch (error) {
		deps.captureError(error, {
			error_step: "uptime_delivery_send",
			event_id: eventId,
		});
		if (readBooleanEnv("SELFHOST")) {
			// Keep the durable payload pending until ClickHouse recovers.
			await job.moveToDelayed(
				Date.now() + UPTIME_DELIVERY_JOB_OPTIONS.backoff.delay,
				token
			);
			throw new DelayedError();
		}
		throw error;
	}
}

function observeWorker<T>(
	worker: Worker<T>,
	step: "uptime_worker" | "uptime_delivery_worker",
	maxAttempts: number,
	describeJob: (data: T) => Record<string, string | undefined>
): Worker<T> {
	worker.on("failed", (job, error) => {
		const attemptsUsed = job?.attemptsMade ?? 0;
		const attemptsMax = job?.opts?.attempts ?? maxAttempts;
		captureError(error, {
			error_step: `${step}_job_failed`,
			job_id: job?.id,
			attempts_used: attemptsUsed,
			attempts_max: attemptsMax,
			is_final_attempt: attemptsUsed >= attemptsMax,
			...(job ? describeJob(job.data) : {}),
		});
	});
	worker.on("stalled", (jobId) => {
		log.warn({
			service: "uptime",
			error_step: `${step}_job_stalled`,
			error_message: "BullMQ job stalled",
			job_id: jobId,
		});
	});
	worker.on("error", (error) => {
		captureError(error, { error_step: `${step}_error` });
	});
	return worker;
}

const workerOptions = {
	lockDuration: UPTIME_WORKER_LOCK_MS,
	maxStalledCount: UPTIME_WORKER_MAX_STALLED_COUNT,
	stalledInterval: UPTIME_WORKER_STALLED_INTERVAL_MS,
};

export function startUptimeWorker() {
	return observeWorker(
		new Worker<UptimeCheckJobData>(
			UPTIME_QUEUE_NAME,
			(job) => processUptimeJob(job),
			{
				...workerOptions,
				connection: getBullMQWorkerConnectionOptions(),
				concurrency: uptimeWorkerConcurrency(),
			}
		),
		"uptime_worker",
		UPTIME_JOB_OPTIONS.attempts,
		(data) => ({ schedule_id: data.scheduleId, trigger: data.trigger })
	);
}

export function startUptimeDeliveryWorker() {
	return observeWorker(
		new Worker<UptimeDeliveryJobData>(
			UPTIME_DELIVERY_QUEUE_NAME,
			(job, token) => processUptimeDeliveryJob(job, uptimeWorkerDeps, token),
			{
				...workerOptions,
				connection: getBullMQWorkerConnectionOptions(),
				concurrency: 4,
			}
		),
		"uptime_delivery_worker",
		UPTIME_DELIVERY_JOB_OPTIONS.attempts,
		(data) => ({
			event_id: uptimeDataSchema.safeParse(data.event).data?.event_id,
		})
	);
}
