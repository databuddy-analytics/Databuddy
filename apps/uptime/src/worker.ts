import {
	getBullMQWorkerConnectionOptions,
	getUptimeDeliveryQueue,
	getUptimeQueue,
	type UptimeCheckJobData,
	type UptimeDeliveryJobData,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_DELIVERY_JOB_NAME,
	UPTIME_DELIVERY_QUEUE_NAME,
	UPTIME_JOB_TIMEOUT_MS,
	UPTIME_QUEUE_NAME,
	uptimeDeliveryJobId,
	uptimeSchedulerId,
} from "@databuddy/redis";
import { Worker } from "bullmq";
import type { RequestLogger } from "evlog";
import { createLogger, log } from "evlog";
import { Cause, Data, Effect, Exit } from "effect";
import {
	type CheckOptions,
	type ScheduleData,
	checkUptime,
	lookupSchedule,
} from "./actions";
import { isHealthExtractionEnabled } from "./json-parser";
import { sendUptimeEvent, type UptimeEventSendResult } from "./lib/producer";
import { captureError } from "./lib/tracing";
import {
	MonitorStatus,
	type ActionResult,
	type ScheduleLookupReason,
	uptimeDataSchema,
	type UptimeData,
} from "./types";
import {
	fireTransitionAlerts,
	getPreviousMonitorStatus,
} from "./uptime-transition-alerts";

class ScheduleNotFound extends Data.TaggedError("ScheduleNotFound")<{
	message: string;
	reason: ScheduleLookupReason;
}> {}

const REAPABLE_REASONS: ReadonlySet<ScheduleLookupReason> = new Set([
	"not_found",
	"malformed",
]);

async function defaultReapOrphanScheduler(scheduleId: string): Promise<void> {
	const queue = getUptimeQueue();
	await queue.removeJobScheduler(uptimeSchedulerId(scheduleId));
}

class SchedulePaused extends Data.TaggedError("SchedulePaused")<
	Record<string, never>
> {}

class CheckFailed extends Data.TaggedError("CheckFailed")<{
	message: string;
}> {}

class DeliveryHandoffFailed extends Data.TaggedError("DeliveryHandoffFailed")<{
	message: string;
}> {}

export interface UptimeWorkerDeps {
	captureError: (
		error: unknown,
		attributes?: Record<string, string | number | boolean>
	) => void;
	checkUptime: (
		siteId: string,
		url: string,
		attempt: number,
		options: CheckOptions
	) => Promise<ActionResult<UptimeData>>;
	createLogger: (
		fields: Record<string, string | number | boolean>
	) => RequestLogger;
	enqueueUptimeDelivery: (data: UptimeData) => Promise<void>;
	fireTransitionAlerts: (options: {
		schedule: ScheduleData;
		data: UptimeData;
		previousStatus?: number;
	}) => Promise<{
		transition_kind: "down" | "recovered" | null;
		alarms_fired: number;
	}>;
	getPreviousMonitorStatus: (monitorId: string) => Promise<number | undefined>;
	isHealthExtractionEnabled: (config: unknown) => boolean;
	lookupSchedule: (scheduleId: string) => Promise<ActionResult<ScheduleData>>;
	reapOrphanScheduler: (scheduleId: string) => Promise<void>;
	sendUptimeEvent: (
		event: unknown,
		key?: string
	) => Promise<UptimeEventSendResult>;
}

async function defaultEnqueueUptimeDelivery(data: UptimeData): Promise<void> {
	await getUptimeDeliveryQueue().add(
		UPTIME_DELIVERY_JOB_NAME,
		{ event: data },
		{ jobId: uptimeDeliveryJobId(data.event_id) }
	);
}

const uptimeWorkerDeps: UptimeWorkerDeps = {
	captureError,
	checkUptime,
	createLogger: (fields) => createLogger(fields),
	enqueueUptimeDelivery: defaultEnqueueUptimeDelivery,
	getPreviousMonitorStatus,
	isHealthExtractionEnabled,
	lookupSchedule,
	reapOrphanScheduler: defaultReapOrphanScheduler,
	sendUptimeEvent,
	fireTransitionAlerts,
};

export const DEFAULT_UPTIME_WORKER_CONCURRENCY = 10_000;
const MAX_STALLED_COUNT = 1_000_000;

export function getUptimeWorkerConcurrency(
	value = process.env.UPTIME_WORKER_CONCURRENCY
): number {
	if (value === undefined || value.trim() === "") {
		return DEFAULT_UPTIME_WORKER_CONCURRENCY;
	}

	const parsed = Number.parseInt(value, 10);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		return DEFAULT_UPTIME_WORKER_CONCURRENCY;
	}

	return parsed;
}

export interface UptimeWorkerJob {
	attemptsMade?: number;
	data: UptimeCheckJobData;
	id?: string;
	name: string;
	updateData: (data: UptimeCheckJobData) => Promise<void>;
}

export interface UptimeDeliveryWorkerJob {
	attemptsMade?: number;
	data: UptimeDeliveryJobData;
	id?: string;
	name: string;
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

const resolveSchedule = (scheduleId: string, deps: UptimeWorkerDeps) =>
	Effect.tryPromise({
		try: () => deps.lookupSchedule(scheduleId),
		catch: (cause) =>
			new ScheduleNotFound({ message: String(cause), reason: "transient" }),
	}).pipe(
		Effect.flatMap((result) =>
			result.success
				? Effect.succeed(result.data)
				: Effect.fail(
						new ScheduleNotFound({
							message: result.error,
							reason: result.reason ?? "transient",
						})
					)
		)
	);

const runCheck = (
	monitorId: string,
	url: string,
	options: CheckOptions,
	deps: UptimeWorkerDeps
) =>
	Effect.tryPromise({
		try: () => deps.checkUptime(monitorId, url, 1, options),
		catch: (cause) => new CheckFailed({ message: String(cause) }),
	}).pipe(
		Effect.flatMap((result) =>
			result.success
				? Effect.succeed(result.data)
				: Effect.fail(new CheckFailed({ message: result.error }))
		)
	);

const fetchPreviousStatus = (monitorId: string, deps: UptimeWorkerDeps) =>
	Effect.tryPromise(() => deps.getPreviousMonitorStatus(monitorId)).pipe(
		Effect.orElseSucceed(() => undefined)
	);

type UptimeEventCheckpoint = (data: UptimeData) => Promise<void>;

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
	previousStatus: number | undefined,
	deps: UptimeWorkerDeps,
	log: RequestLogger
) =>
	Effect.tryPromise({
		try: () => deps.fireTransitionAlerts({ schedule, data, previousStatus }),
		catch: (cause) => cause,
	}).pipe(
		Effect.tap((transition) =>
			Effect.sync(() => {
				if (transition.transition_kind) {
					log.set({
						transition_kind: transition.transition_kind,
						alarms_fired: transition.alarms_fired,
					});
				}
			})
		),
		Effect.catch((error) =>
			Effect.sync(() =>
				log.set({
					email_error: error instanceof Error ? error.message : "unknown",
				})
			)
		)
	);

function reapScheduler(
	scheduleId: string,
	reason: ScheduleLookupReason,
	deps: UptimeWorkerDeps,
	log: RequestLogger
): void {
	deps
		.reapOrphanScheduler(scheduleId)
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

const processCheck = (
	scheduleId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
	checkpoint: UptimeEventCheckpoint
) =>
	Effect.gen(function* () {
		const schedule = yield* timed(
			"lookup_schedule",
			resolveSchedule(scheduleId, deps),
			log
		).pipe(
			Effect.catchTag("ScheduleNotFound", (e) => {
				log.set({
					outcome: "schedule_not_found",
					error_message: e.message,
					schedule_lookup_reason: e.reason,
				});
				if (REAPABLE_REASONS.has(e.reason)) {
					reapScheduler(scheduleId, e.reason, deps, log);
				}
				return Effect.fail(new ScheduleNotFound(e));
			})
		);

		log.set({
			organization_id: schedule.organizationId,
			schedule_timeout_ms: schedule.timeout ?? 0,
			schedule_cache_bust: schedule.cacheBust,
			schedule_health_extract: deps.isHealthExtractionEnabled(
				schedule.jsonParsingConfig
			),
		});

		if (schedule.isPaused) {
			log.set({ outcome: "skipped_paused" });
			return yield* Effect.fail(new SchedulePaused({}));
		}

		const monitorId = schedule.websiteId || scheduleId;

		log.set({
			monitor_id: monitorId,
			check_url: schedule.url,
			...(schedule.websiteId ? { website_id: schedule.websiteId } : {}),
		});

		const options: CheckOptions = {
			timeout: schedule.timeout ?? undefined,
			cacheBust: schedule.cacheBust,
			extractHealth: deps.isHealthExtractionEnabled(schedule.jsonParsingConfig),
		};

		const data = yield* timed(
			"check_uptime",
			runCheck(monitorId, schedule.url, options, deps),
			log
		).pipe(
			Effect.catchTag("CheckFailed", (e) => {
				log.set({
					outcome: "check_failed",
					error_message: e.message,
				});
				return Effect.fail(new CheckFailed(e));
			})
		);

		const previousStatus = yield* timed(
			"previous_status",
			fetchPreviousStatus(monitorId, deps),
			log
		);

		log.set({
			event_id: data.event_id,
			outcome: data.status === MonitorStatus.UP ? "up" : "down",
			previous_uptime_status:
				previousStatus === undefined ? -1 : previousStatus,
			monitor_status: data.status,
			http_code: data.http_code,
			total_ms: data.total_ms,
			ttfb_ms: data.ttfb_ms,
			probe_region: data.probe_region,
			ssl_valid: data.ssl_valid === 1,
			ssl_expiry: data.ssl_expiry,
			response_bytes: data.response_bytes,
			redirect_count: data.redirect_count,
			content_changed: data.content_hash !== "",
			has_json_data: data.json_data !== undefined,
			error_message: data.error || "",
		});

		// The source BullMQ job is the durable checkpoint. Persist the exact
		// probe result before queuing it for delivery so a retry never runs a
		// replacement probe with a new timestamp or event ID.
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
			runTransitionAlerts(schedule, data, previousStatus, deps, log),
			log
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
			error instanceof CheckFailed ||
			error instanceof DeliveryHandoffFailed
		) {
			throw new Error(error.message);
		}
	}
}

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
			timed(
				"delivery_queue_admission",
				handoffDelivery(
					data,
					() => deps.enqueueUptimeDelivery(data),
					"uptime_delivery_enqueue",
					deps
				),
				log
			)
		);
		log.set({ delivery_queue_admitted: true });

		const scheduleExit = await Effect.runPromiseExit(
			resolveSchedule(job.data.scheduleId, deps)
		);
		if (Exit.isSuccess(scheduleExit)) {
			await Effect.runPromise(
				timed(
					"transition_email",
					runTransitionAlerts(scheduleExit.value, data, undefined, deps, log),
					log
				)
			);
		} else {
			const error = Cause.squash(scheduleExit.cause);
			log.set({
				transition_alert_skipped: true,
				transition_alert_skip_reason:
					error instanceof Error ? error.message : String(error),
			});
		}
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

	const persistedEvent = job.data.delivery?.event;
	if (persistedEvent !== undefined) {
		const parsedEvent = uptimeDataSchema.safeParse(persistedEvent);
		if (!parsedEvent.success) {
			throw new Error("Invalid persisted uptime delivery payload");
		}
		await replayPersistedUptimeDelivery(job, parsedEvent.data, deps);
		return;
	}

	await processUptimeCheck(
		job.data.scheduleId,
		job.data.trigger,
		deps,
		{
			id: job.id,
			attempt: job.attemptsMade,
		},
		async (data) =>
			job.updateData({
				...job.data,
				delivery: { event: data },
			})
	);
}

export async function processUptimeDeliveryJob(
	job: UptimeDeliveryWorkerJob,
	deps: UptimeWorkerDeps = uptimeWorkerDeps
): Promise<void> {
	if (job.name !== UPTIME_DELIVERY_JOB_NAME) {
		throw new Error(`Unknown uptime delivery job: ${job.name}`);
	}
	const parsedEvent = uptimeDataSchema.safeParse(job.data.event);
	if (!parsedEvent.success) {
		throw new Error("Invalid uptime delivery payload");
	}

	const data = parsedEvent.data;
	try {
		const result = await deps.sendUptimeEvent(data, data.site_id);
		if (!result.sent) {
			throw new Error(`Redpanda delivery failed: ${result.reason}`);
		}
	} catch (error) {
		deps.captureError(error, {
			error_step: "uptime_delivery_send",
			event_id: data.event_id,
			job_id: job.id ?? "",
		});
		throw error;
	}
}

export function startUptimeWorker() {
	const worker = new Worker<UptimeCheckJobData>(
		UPTIME_QUEUE_NAME,
		(job) => processUptimeJob(job),
		{
			connection: getBullMQWorkerConnectionOptions(),
			concurrency: getUptimeWorkerConcurrency(),
			lockDuration: UPTIME_JOB_TIMEOUT_MS * 3,
			maxStalledCount: MAX_STALLED_COUNT,
			stalledInterval: UPTIME_JOB_TIMEOUT_MS * 4,
		}
	);

	worker.on("failed", (job, error) => {
		const attemptsMade = job?.attemptsMade ?? 0;
		const maxAttempts = job?.opts?.attempts ?? 1_000_000;
		const isFinalAttempt = attemptsMade >= maxAttempts;

		captureError(error, {
			error_step: "uptime_worker_job_failed",
			schedule_id: job?.data.scheduleId ?? "",
			job_id: job?.id ?? "",
			trigger: job?.data.trigger ?? "",
			attempts_used: attemptsMade,
			attempts_max: maxAttempts,
			is_final_attempt: isFinalAttempt,
		});
	});

	worker.on("stalled", (jobId) => {
		log.warn({
			service: "uptime",
			error_step: "uptime_worker_job_stalled",
			error_message: "BullMQ job stalled",
			job_id: jobId,
		});
	});

	worker.on("error", (error) => {
		captureError(error, {
			error_step: "uptime_worker_error",
		});
	});

	return worker;
}

export function startUptimeDeliveryWorker() {
	const worker = new Worker<UptimeDeliveryJobData>(
		UPTIME_DELIVERY_QUEUE_NAME,
		(job) => processUptimeDeliveryJob(job),
		{
			connection: getBullMQWorkerConnectionOptions(),
			concurrency: 1,
			lockDuration: UPTIME_JOB_TIMEOUT_MS * 3,
			maxStalledCount: MAX_STALLED_COUNT,
			stalledInterval: UPTIME_JOB_TIMEOUT_MS * 4,
		}
	);

	worker.on("failed", (job, error) => {
		const parsedEvent = job
			? uptimeDataSchema.safeParse(job.data.event)
			: undefined;
		captureError(error, {
			error_step: "uptime_delivery_worker_job_failed",
			event_id: parsedEvent?.success ? parsedEvent.data.event_id : "",
			job_id: job?.id ?? "",
			attempts_used: job?.attemptsMade ?? 0,
			attempts_max: job?.opts?.attempts ?? 1_000_000,
		});
	});

	worker.on("stalled", (jobId) => {
		log.warn({
			service: "uptime",
			error_step: "uptime_delivery_worker_job_stalled",
			error_message: "BullMQ delivery job stalled",
			job_id: jobId,
		});
	});

	worker.on("error", (error) => {
		captureError(error, {
			error_step: "uptime_delivery_worker_error",
		});
	});

	return worker;
}
