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
	getPreviousMonitorStatus,
	sendUptimeTransitionEmailsIfNeeded,
} from "./uptime-transition-emails";

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
	getPreviousMonitorStatus: (monitorId: string) => Promise<number | undefined>;
	isHealthExtractionEnabled: (config: unknown) => boolean;
	lookupSchedule: (scheduleId: string) => Promise<ActionResult<ScheduleData>>;
	sendUptimeEvent: (data: UptimeData, monitorId: string) => Promise<void>;
	sendUptimeTransitionEmailsIfNeeded: (options: {
		schedule: ScheduleData;
		data: UptimeData;
		previousStatus?: number;
	}) => Promise<{ transition_kind: "down" | "recovered" | null; emails_sent: number }>;
}

const uptimeWorkerDeps: UptimeWorkerDeps = {
	captureError,
	checkUptime,
	createLogger: (fields) => createLogger(fields),
	getPreviousMonitorStatus,
	isHealthExtractionEnabled,
	lookupSchedule,
	sendUptimeEvent,
	sendUptimeTransitionEmailsIfNeeded,
};

export interface UptimeWorkerJob {
	attemptsMade?: number;
	data: UptimeCheckJobData;
	id?: string;
	name: string;
}

export async function processUptimeCheck(
	scheduleId: string,
	trigger: UptimeCheckJobData["trigger"],
	deps: UptimeWorkerDeps = uptimeWorkerDeps,
	jobMeta?: { id?: string; attempt?: number }
) {
	const startedAt = performance.now();
	const log = deps.createLogger({
		schedule_id: scheduleId,
		uptime_trigger: trigger,
		...(jobMeta?.id ? { job_id: jobMeta.id } : {}),
		...(jobMeta?.attempt ? { job_attempt: jobMeta.attempt } : {}),
	});

	try {
		const t0 = performance.now();
		const schedule = await deps.lookupSchedule(scheduleId);
		log.set({ "timing.lookup_schedule": Math.round(performance.now() - t0) });

		if (!schedule.success) {
			log.set({
				outcome: "schedule_not_found",
				error_message: schedule.error,
			});
			return;
		}

		log.set({
			organization_id: schedule.data.organizationId,
			schedule_timeout_ms: schedule.data.timeout ?? 0,
			schedule_cache_bust: schedule.data.cacheBust,
			schedule_health_extract: deps.isHealthExtractionEnabled(
				schedule.data.jsonParsingConfig
			),
		});

		if (schedule.data.isPaused) {
			log.set({ outcome: "skipped_paused" });
			return;
		}

		const monitorId = schedule.data.websiteId || scheduleId;

		log.set({
			monitor_id: monitorId,
			check_url: schedule.data.url,
			...(schedule.data.websiteId
				? { website_id: schedule.data.websiteId }
				: {}),
		});

		const options: CheckOptions = {
			timeout: schedule.data.timeout ?? undefined,
			cacheBust: schedule.data.cacheBust,
			extractHealth: deps.isHealthExtractionEnabled(
				schedule.data.jsonParsingConfig
			),
		};

		const t1 = performance.now();
		const result = await deps.checkUptime(
			monitorId,
			schedule.data.url,
			1,
			options
		);
		log.set({ "timing.check_uptime": Math.round(performance.now() - t1) });

		if (!result.success) {
			log.set({
				outcome: "check_failed",
				error_message: result.error,
			});
			throw new Error(result.error);
		}

		const t2 = performance.now();
		const previousStatus = await deps.getPreviousMonitorStatus(monitorId);
		log.set({
			"timing.previous_status": Math.round(performance.now() - t2),
		});

		log.set({
			outcome: result.data.status === MonitorStatus.UP ? "up" : "down",
			previous_uptime_status:
				previousStatus === undefined ? -1 : previousStatus,
			monitor_status: result.data.status,
			http_code: result.data.http_code,
			total_ms: result.data.total_ms,
			ttfb_ms: result.data.ttfb_ms,
			probe_region: result.data.probe_region,
			ssl_valid: result.data.ssl_valid === 1,
			ssl_expiry: result.data.ssl_expiry,
			response_bytes: result.data.response_bytes,
			redirect_count: result.data.redirect_count,
			content_changed: result.data.content_hash !== "",
			has_json_data: result.data.json_data !== undefined,
			error_message: result.data.error || "",
		});

		const t3 = performance.now();
		try {
			await deps.sendUptimeEvent(result.data, monitorId);
			log.set({ kafka_sent: true });
		} catch (error) {
			log.set({
				kafka_sent: false,
				kafka_error: error instanceof Error ? error.message : "unknown",
			});
		}
		log.set({ "timing.kafka": Math.round(performance.now() - t3) });

		const t4 = performance.now();
		try {
			const transition = await deps.sendUptimeTransitionEmailsIfNeeded({
				schedule: schedule.data,
				data: result.data,
				previousStatus,
			});
			if (transition.transition_kind) {
				log.set({
					transition_kind: transition.transition_kind,
					emails_sent: transition.emails_sent,
				});
			}
		} catch (error) {
			log.set({
				email_error: error instanceof Error ? error.message : "unknown",
			});
		}
		log.set({ "timing.transition_email": Math.round(performance.now() - t4) });
	} finally {
		log.set({
			check_duration_ms: Math.round(performance.now() - startedAt),
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
			concurrency: Number(process.env.UPTIME_WORKER_CONCURRENCY ?? 10_000),
			lockDuration: UPTIME_JOB_TIMEOUT_MS * 3,
			stalledInterval: UPTIME_JOB_TIMEOUT_MS * 4,
		}
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
