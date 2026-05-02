import {
	getBullMQWorkerConnectionOptions,
	type UptimeCheckJobData,
	UPTIME_CHECK_JOB_NAME,
	UPTIME_JOB_TIMEOUT_MS,
	UPTIME_QUEUE_NAME,
} from "@databuddy/redis";
import { Worker } from "bullmq";
import type { RequestLogger } from "evlog";
import { createLogger } from "evlog";
import { Cause, Data, Effect, Exit } from "effect";
import {
	type CheckOptions,
	type ScheduleData,
	checkUptime,
	lookupSchedule,
} from "./actions";
import { isHealthExtractionEnabled } from "./json-parser";
import { sendUptimeEvent } from "./lib/producer";
import { captureError } from "./lib/tracing";
import { MonitorStatus, type ActionResult, type UptimeData } from "./types";
import {
	fireTransitionAlerts,
	getPreviousMonitorStatus,
} from "./uptime-transition-alerts";

class ScheduleNotFound extends Data.TaggedError("ScheduleNotFound")<{
	message: string;
}> {}

class SchedulePaused extends Data.TaggedError("SchedulePaused")<{}> {}

class CheckFailed extends Data.TaggedError("CheckFailed")<{
	message: string;
}> {}

export interface UptimeWorkerDeps {
	captureError: (
		error: unknown,
		attributes?: Record<string, string | number | boolean>,
	) => void;
	checkUptime: (
		siteId: string,
		url: string,
		attempt: number,
		options: CheckOptions,
	) => Promise<ActionResult<UptimeData>>;
	createLogger: (
		fields: Record<string, string | number | boolean>,
	) => RequestLogger;
	getPreviousMonitorStatus: (
		monitorId: string,
	) => Promise<number | undefined>;
	isHealthExtractionEnabled: (config: unknown) => boolean;
	lookupSchedule: (
		scheduleId: string,
	) => Promise<ActionResult<ScheduleData>>;
	sendUptimeEvent: (data: UptimeData, monitorId: string) => Promise<void>;
	fireTransitionAlerts: (options: {
		schedule: ScheduleData;
		data: UptimeData;
		previousStatus?: number;
	}) => Promise<{
		transition_kind: "down" | "recovered" | null;
		alarms_fired: number;
	}>;
}

const uptimeWorkerDeps: UptimeWorkerDeps = {
	captureError,
	checkUptime,
	createLogger: (fields) => createLogger(fields),
	getPreviousMonitorStatus,
	isHealthExtractionEnabled,
	lookupSchedule,
	sendUptimeEvent,
	fireTransitionAlerts,
};

export interface UptimeWorkerJob {
	attemptsMade?: number;
	data: UptimeCheckJobData;
	id?: string;
	name: string;
}

const timed = <A, E>(
	label: string,
	effect: Effect.Effect<A, E>,
	log: RequestLogger,
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
		catch: (cause) => new ScheduleNotFound({ message: String(cause) }),
	}).pipe(
		Effect.flatMap((result) =>
			result.success
				? Effect.succeed(result.data)
				: Effect.fail(new ScheduleNotFound({ message: result.error })),
		),
	);

const runCheck = (
	monitorId: string,
	url: string,
	options: CheckOptions,
	deps: UptimeWorkerDeps,
) =>
	Effect.tryPromise({
		try: () => deps.checkUptime(monitorId, url, 1, options),
		catch: (cause) => new CheckFailed({ message: String(cause) }),
	}).pipe(
		Effect.flatMap((result) =>
			result.success
				? Effect.succeed(result.data)
				: Effect.fail(new CheckFailed({ message: result.error })),
		),
	);

const fetchPreviousStatus = (monitorId: string, deps: UptimeWorkerDeps) =>
	Effect.tryPromise(() => deps.getPreviousMonitorStatus(monitorId)).pipe(
		Effect.orElseSucceed(() => undefined),
	);

const publishEvent = (
	data: UptimeData,
	monitorId: string,
	deps: UptimeWorkerDeps,
	log: RequestLogger,
) =>
	Effect.tryPromise({
		try: () => deps.sendUptimeEvent(data, monitorId),
		catch: (cause) => cause,
	}).pipe(
		Effect.tap(() => Effect.sync(() => log.set({ kafka_sent: true }))),
		Effect.catch((error) =>
			Effect.sync(() =>
				log.set({
					kafka_sent: false,
					kafka_error:
						error instanceof Error ? error.message : "unknown",
				}),
			),
		),
	);

const runTransitionAlerts = (
	schedule: ScheduleData,
	data: UptimeData,
	previousStatus: number | undefined,
	deps: UptimeWorkerDeps,
	log: RequestLogger,
) =>
	Effect.tryPromise({
		try: () =>
			deps.fireTransitionAlerts({ schedule, data, previousStatus }),
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
			}),
		),
		Effect.catch((error) =>
			Effect.sync(() =>
				log.set({
					email_error:
						error instanceof Error ? error.message : "unknown",
				}),
			),
		),
	);

const processCheck = (
	scheduleId: string,
	log: RequestLogger,
	deps: UptimeWorkerDeps,
) =>
	Effect.gen(function* () {
		const schedule = yield* timed(
			"lookup_schedule",
			resolveSchedule(scheduleId, deps),
			log,
		).pipe(
			Effect.catchTag("ScheduleNotFound", (e) => {
				log.set({
					outcome: "schedule_not_found",
					error_message: e.message,
				});
				return Effect.fail(new ScheduleNotFound(e));
			}),
		);

		log.set({
			organization_id: schedule.organizationId,
			schedule_timeout_ms: schedule.timeout ?? 0,
			schedule_cache_bust: schedule.cacheBust,
			schedule_health_extract: deps.isHealthExtractionEnabled(
				schedule.jsonParsingConfig,
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
			...(schedule.websiteId
				? { website_id: schedule.websiteId }
				: {}),
		});

		const options: CheckOptions = {
			timeout: schedule.timeout ?? undefined,
			cacheBust: schedule.cacheBust,
			extractHealth: deps.isHealthExtractionEnabled(
				schedule.jsonParsingConfig,
			),
		};

		const data = yield* timed(
			"check_uptime",
			runCheck(monitorId, schedule.url, options, deps),
			log,
		).pipe(
			Effect.catchTag("CheckFailed", (e) => {
				log.set({
					outcome: "check_failed",
					error_message: e.message,
				});
				return Effect.fail(new CheckFailed(e));
			}),
		);

		const previousStatus = yield* timed(
			"previous_status",
			fetchPreviousStatus(monitorId, deps),
			log,
		);

		log.set({
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

		yield* timed(
			"kafka",
			publishEvent(data, monitorId, deps, log),
			log,
		);

		yield* timed(
			"transition_email",
			runTransitionAlerts(schedule, data, previousStatus, deps, log),
			log,
		);
	});

export async function processUptimeCheck(
	scheduleId: string,
	trigger: UptimeCheckJobData["trigger"],
	deps: UptimeWorkerDeps = uptimeWorkerDeps,
	jobMeta?: { id?: string; attempt?: number },
) {
	const startedAt = performance.now();
	const log = deps.createLogger({
		schedule_id: scheduleId,
		uptime_trigger: trigger,
		...(jobMeta?.id ? { job_id: jobMeta.id } : {}),
		...(jobMeta?.attempt ? { job_attempt: jobMeta.attempt } : {}),
	});

	const exit = await Effect.runPromiseExit(processCheck(scheduleId, log, deps));

	log.set({ check_duration_ms: Math.round(performance.now() - startedAt) });
	log.emit();

	if (Exit.isFailure(exit)) {
		const error = Cause.squash(exit.cause);
		if (error instanceof CheckFailed) {
			throw new Error(error.message);
		}
	}
}

export async function processUptimeJob(
	job: UptimeWorkerJob,
	deps: UptimeWorkerDeps = uptimeWorkerDeps,
) {
	if (job.name !== UPTIME_CHECK_JOB_NAME) {
		throw new Error(`Unknown uptime job: ${job.name}`);
	}
	await processUptimeCheck(job.data.scheduleId, job.data.trigger, deps, {
		id: job.id,
		attempt: job.attemptsMade,
	});
}

export function startUptimeWorker() {
	const worker = new Worker<UptimeCheckJobData>(
		UPTIME_QUEUE_NAME,
		(job) => processUptimeJob(job),
		{
			connection: getBullMQWorkerConnectionOptions(),
			concurrency: Number(
				process.env.UPTIME_WORKER_CONCURRENCY ?? 10_000,
			),
			lockDuration: UPTIME_JOB_TIMEOUT_MS * 3,
			stalledInterval: UPTIME_JOB_TIMEOUT_MS * 4,
		},
	);

	worker.on("failed", (job, error) => {
		const attemptsMade = job?.attemptsMade ?? 0;
		const maxAttempts = job?.opts?.attempts ?? 3;
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
		captureError(new Error("BullMQ job stalled"), {
			error_step: "uptime_worker_job_stalled",
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
