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
import type { RequestLogger } from "evlog";
import { createLogger, log } from "evlog";
import { Cause, Data, Effect, Exit } from "effect";
import {
	type CheckOptions,
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

async function acquireCheckLock(
	scheduleId: string,
	ttlMs: number
): Promise<string | null> {
	const token = randomUUID();
	const result = await redis.set(
		`${CHECK_LOCK_PREFIX}${scheduleId}`,
		token,
		"PX",
		ttlMs,
		"NX"
	);
	return result === "OK" ? token : null;
}

async function releaseCheckLock(
	scheduleId: string,
	token: string
): Promise<void> {
	await redis.eval(
		RELEASE_CHECK_LOCK_SCRIPT,
		1,
		`${CHECK_LOCK_PREFIX}${scheduleId}`,
		token
	);
}

export interface UptimeWorkerDeps {
	acquireCheckLock: typeof acquireCheckLock;
	captureError: typeof captureError;
	checkUptime: typeof checkUptime;
	createLogger: (
		fields: Record<string, string | number | boolean>
	) => RequestLogger;
	enqueueUptimeDelivery: (data: UptimeData) => Promise<void>;
	fireTransitionAlerts: typeof fireTransitionAlerts;
	getPreviousMonitorState: typeof getPreviousMonitorState;
	lookupSchedule: typeof lookupSchedule;
	reapScheduler: (scheduleId: string) => Promise<void>;
	releaseCheckLock: typeof releaseCheckLock;
	sendUptimeEvent: typeof sendUptimeEvent;
	setMonitorState: typeof writeMonitorState;
}

const uptimeWorkerDeps: UptimeWorkerDeps = {
	acquireCheckLock,
	captureError,
	checkUptime,
	createLogger: (fields) => createLogger(fields),
	enqueueUptimeDelivery: async (data) => {
		await getUptimeDeliveryQueue().add(
			UPTIME_DELIVERY_QUEUE_NAME,
			{ event: data },
			{ jobId: uptimeDeliveryJobId(data.event_id) }
		);
	},
	fireTransitionAlerts,
	getPreviousMonitorState,
	lookupSchedule,
	reapScheduler: async (scheduleId) => {
		await getUptimeQueue().removeJobScheduler(uptimeSchedulerId(scheduleId));
	},
	releaseCheckLock,
	sendUptimeEvent,
	setMonitorState: writeMonitorState,
};

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

function toUptimeStorageEvent({
	event_id: _eventId,
	...event
}: UptimeData): Omit<UptimeData, "event_id"> {
	return event;
}

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
	url: string,
	options: CheckOptions,
	deps: UptimeWorkerDeps
) =>
	Effect.gen(function* () {
		let data = yield* deps.checkUptime(monitorId, url, 1, options);
		for (
			let attempt = 2;
			data.status !== MonitorStatus.UP &&
			!isTimedOut(data) &&
			attempt <= CHECK_ATTEMPTS;
			attempt++
		) {
			yield* Effect.sleep(checkRetryDelayMs());
			data = yield* deps.checkUptime(monitorId, url, attempt, options);
		}
		return data;
	});

const fetchPreviousState = (monitorId: string, deps: UptimeWorkerDeps) =>
	Effect.tryPromise({
		try: () => deps.getPreviousMonitorState(monitorId),
		catch: (cause) => new PreviousStateUnavailable({ message: String(cause) }),
	}).pipe(
		Effect.flatMap((state) =>
			state.kind === "unavailable"
				? Effect.fail(
						new PreviousStateUnavailable({
							message: `Previous monitor state unavailable for ${monitorId}`,
						})
					)
				: Effect.succeed(state)
		)
	);

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

const persistMonitorState = (
	monitorId: string,
	data: UptimeData,
	deps: UptimeWorkerDeps
) =>
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
	);

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

const runTransitionAlerts = (
	schedule: ScheduleData,
	data: UptimeData,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	Effect.tryPromise({
		try: () => deps.fireTransitionAlerts({ schedule, data }),
		catch: (cause) => cause,
	}).pipe(
		Effect.match({
			onSuccess: (transition) => {
				if (transition.transition_kind) {
					log.set({
						transition_kind: transition.transition_kind,
						alarms_fired: transition.alarms_fired,
					});
				}
			},
			onFailure: (error) => {
				deps.captureError(error, {
					error_step: "transition_alerts",
					schedule_id: schedule.id,
				});
				log.set({
					transition_alert_error:
						error instanceof Error ? error.message : "unknown",
				});
			},
		})
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

type CheckLock = { token: string } | "held" | "unavailable";

const acquireLock = (
	scheduleId: string,
	ttlMs: number,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	Effect.tryPromise({
		try: () => deps.acquireCheckLock(scheduleId, ttlMs),
		catch: (cause) => cause,
	}).pipe(
		Effect.map((token): CheckLock => (token === null ? "held" : { token })),
		Effect.catch((cause) =>
			Effect.sync((): CheckLock => {
				deps.captureError(cause, {
					error_step: "check_lock_acquire",
					schedule_id: scheduleId,
				});
				log.set({ check_lock_unavailable: true });
				return "unavailable";
			})
		)
	);

const releaseLock = (
	scheduleId: string,
	lock: CheckLock,
	deps: UptimeWorkerDeps
) =>
	typeof lock === "string"
		? Effect.void
		: Effect.promise(() =>
				deps
					.releaseCheckLock(scheduleId, lock.token)
					.catch((cause: unknown) => {
						deps.captureError(cause, {
							error_step: "check_lock_release",
							schedule_id: scheduleId,
						});
					})
			);

const runLockedCheck = (
	schedule: ScheduleData,
	monitorId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
	checkpoint: UptimeEventCheckpoint
) =>
	Effect.gen(function* () {
		const checked = yield* timed(
			"check_uptime",
			runCheck(
				monitorId,
				schedule.url,
				{
					timeout: schedule.timeout ?? undefined,
					cacheBust: schedule.cacheBust,
				},
				deps
			),
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
						fetchPreviousState(monitorId, deps),
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
			persistMonitorState(monitorId, data, deps),
			log
		);

		yield* timed(
			"delivery_queue_admission",
			handoffDelivery(
				data,
				() => deps.enqueueUptimeDelivery(data),
				"uptime_delivery_enqueue",
				deps
			),
			log
		);
		log.set({ delivery_queue_admitted: true });

		yield* timed(
			"transition_email",
			runTransitionAlerts(schedule, data, deps, log),
			log
		);
	});

type UptimeEventCheckpoint = (data: UptimeData) => Promise<void>;

const processCheck = (
	scheduleId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
	checkpoint: UptimeEventCheckpoint
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

		const lock = yield* acquireLock(
			scheduleId,
			checkLockTtlMs(schedule.timeout),
			deps,
			log
		);
		if (lock === "held") {
			log.set({ outcome: "skipped_overlap" });
			return;
		}

		yield* runLockedCheck(schedule, monitorId, log, deps, checkpoint).pipe(
			Effect.ensuring(releaseLock(scheduleId, lock, deps))
		);
	});

export async function processUptimeCheck(
	scheduleId: string,
	trigger: UptimeCheckJobData["trigger"],
	deps: UptimeWorkerDeps,
	jobMeta: { id?: string; attempt?: number } | undefined,
	checkpoint: UptimeEventCheckpoint
) {
	const startedAt = performance.now();
	const log = deps.createLogger({
		schedule_id: scheduleId,
		uptime_trigger: trigger,
		...(jobMeta?.id ? { job_id: jobMeta.id } : {}),
		...(jobMeta?.attempt ? { job_attempt: jobMeta.attempt } : {}),
	});

	const exit = await Effect.runPromiseExit(
		processCheck(scheduleId, log, deps, checkpoint)
	);

	log.set({ check_duration_ms: Math.round(performance.now() - startedAt) });
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

const replayDelivery = (
	scheduleId: string,
	data: UptimeData,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	Effect.gen(function* () {
		yield* timed(
			"delivery_queue_admission",
			handoffDelivery(
				data,
				() => deps.enqueueUptimeDelivery(data),
				"uptime_delivery_enqueue",
				deps
			),
			log
		);
		log.set({ delivery_queue_admitted: true });

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
			yield* timed(
				"transition_email",
				runTransitionAlerts(schedule, data, deps, log),
				log
			);
		}
	});

async function replayPersistedUptimeDelivery(
	job: UptimeWorkerJob,
	data: UptimeData,
	deps: UptimeWorkerDeps
): Promise<void> {
	const startedAt = performance.now();
	const log = deps.createLogger({
		schedule_id: job.data.scheduleId,
		uptime_trigger: job.data.trigger,
		event_id: data.event_id,
		delivery_replay: true,
		...(job.id ? { job_id: job.id } : {}),
		...(job.attemptsMade ? { job_attempt: job.attemptsMade } : {}),
	});

	try {
		await Effect.runPromise(
			replayDelivery(job.data.scheduleId, data, deps, log)
		);
	} finally {
		log.set({
			delivery_replay_duration_ms: Math.round(performance.now() - startedAt),
		});
		log.emit();
	}
}

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
	const persistedEvent = jobData.delivery?.event;
	if (persistedEvent !== undefined) {
		const parsedEvent = uptimeDataSchema.safeParse(persistedEvent);
		if (!parsedEvent.success) {
			throw new Error("Invalid persisted uptime delivery payload");
		}
		await replayPersistedUptimeDelivery(job, parsedEvent.data, deps);
		return;
	}

	await processUptimeCheck(
		jobData.scheduleId,
		jobData.trigger,
		deps,
		{
			id: job.id,
			attempt: job.attemptsMade,
		},
		async (data) =>
			job.updateData({
				...jobData,
				delivery: { event: data },
			})
	);
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

	const data = parsedEvent.data;
	try {
		await deps.sendUptimeEvent(toUptimeStorageEvent(data), data.site_id);
	} catch (error) {
		deps.captureError(error, {
			error_step: "uptime_delivery_send",
			event_id: data.event_id,
			job_id: job.id ?? "",
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
	describeJob: (data: unknown) => Record<string, string>
): Worker<T> {
	worker.on("failed", (job, error) => {
		const attemptsUsed = job?.attemptsMade ?? 0;
		const attemptsMax = job?.opts?.attempts ?? maxAttempts;
		captureError(error, {
			error_step: `${step}_job_failed`,
			job_id: job?.id ?? "",
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
		(data): Record<string, string> => {
			const parsed = uptimeCheckJobDataSchema.safeParse(data);
			return parsed.success
				? {
						schedule_id: parsed.data.scheduleId,
						trigger: parsed.data.trigger,
					}
				: {};
		}
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
		(data): Record<string, string> => {
			const parsed = uptimeDeliveryJobDataSchema.safeParse(data);
			const event = parsed.success
				? uptimeDataSchema.safeParse(parsed.data.event)
				: undefined;
			return event?.success ? { event_id: event.data.event_id } : {};
		}
	);
}
