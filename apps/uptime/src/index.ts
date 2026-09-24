import { db, shutdownPostgres, sql } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	closeUptimeQueue,
	getUptimeDeliveryQueue,
	getUptimeQueue,
} from "@databuddy/redis";
import { buildHttpErrorResponse } from "@databuddy/shared/http-error-response";
import {
	createDatabuddyEvlogEnv,
	databuddyEvlogRedaction,
} from "@databuddy/shared/evlog-redaction";
import { Elysia } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { UPTIME_ENV } from "./lib/env";
import {
	enrichUptimeWideEvent,
	flushBatchedUptimeDrain,
	uptimeLoggerDrain,
} from "./lib/evlog-uptime";
import { disconnectProducer, pingRedpanda } from "./lib/producer";
import { captureError } from "./lib/tracing";
import { syncSchedulers } from "./sync-schedulers";
import { startUptimeDeliveryWorker, startUptimeWorker } from "./worker";

initLogger({
	env: createDatabuddyEvlogEnv("uptime"),
	redact: databuddyEvlogRedaction,
	drain: uptimeLoggerDrain,
});

let shuttingDown = false;
let shutdownExitCode = 0;
let uptimeWorker: ReturnType<typeof startUptimeWorker> | null = null;
let uptimeDeliveryWorker: ReturnType<typeof startUptimeDeliveryWorker> | null =
	null;

process.on("unhandledRejection", (reason) => {
	captureError(reason, { process: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
	captureError(error, {
		process: "uncaughtException",
		error_source: "process",
	});
	shutdown("uncaughtException", 1).catch((shutdownError) => {
		captureError(shutdownError, {
			process: "uncaughtException",
			error_step: "fatal_shutdown",
		});
		process.exit(1);
	});
});

const DRAIN_TIMEOUT_MS = 30_000;
const PROBE_TIMEOUT_MS = 6000;

function withTimeout<T>(
	promise: Promise<T>,
	ms: number,
	label: string
): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`${label} timed out after ${ms}ms`)),
			ms
		);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function drainStep(
	step: string,
	action: () => Promise<unknown> | undefined
): Promise<void> {
	try {
		await action();
	} catch (error) {
		captureError(error, { lifecycle: "shutdown", error_step: step });
	}
}

async function drainAll(): Promise<void> {
	// Stop source admission before closing the relay, preserving queued events
	// for the next worker process if the shutdown window expires.
	await drainStep("uptime_worker_close", () => uptimeWorker?.close());
	await drainStep("uptime_delivery_worker_close", () =>
		uptimeDeliveryWorker?.close()
	);
	await Promise.all([
		drainStep("uptime_queue_close", closeUptimeQueue),
		drainStep("uptime_log_flush", flushBatchedUptimeDrain),
		drainStep("uptime_postgres_close", shutdownPostgres),
		drainStep("uptime_producer_disconnect", disconnectProducer),
	]);
}

async function shutdown(signal: string, exitCode = 0) {
	shutdownExitCode = Math.max(shutdownExitCode, exitCode);
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	if (schedulerResyncTimer) {
		clearInterval(schedulerResyncTimer);
	}
	log.info("lifecycle", `${signal} received, shutting down gracefully`);
	try {
		await withTimeout(drainAll(), DRAIN_TIMEOUT_MS, "drain");
	} catch (error) {
		captureError(error, {
			lifecycle: "shutdown",
			error_step: "drain_timeout",
			drain_timeout_ms: DRAIN_TIMEOUT_MS,
		});
	} finally {
		process.exit(shutdownExitCode);
	}
}

const SCHEDULER_RESYNC_INTERVAL_MS = 15 * 60_000;
let schedulerResyncTimer: ReturnType<typeof setInterval> | null = null;

async function reportQueueDepths(): Promise<void> {
	const [checks, delivery] = await Promise.all([
		getUptimeQueue().getJobCounts("active", "waiting", "delayed", "failed"),
		getUptimeDeliveryQueue().getJobCounts(
			"active",
			"waiting",
			"delayed",
			"failed"
		),
	]);
	log.info({
		queue_depth: true,
		checks_active: checks.active ?? 0,
		checks_waiting: checks.waiting ?? 0,
		checks_delayed: checks.delayed ?? 0,
		checks_failed: checks.failed ?? 0,
		delivery_active: delivery.active ?? 0,
		delivery_waiting: delivery.waiting ?? 0,
		delivery_delayed: delivery.delayed ?? 0,
		delivery_failed: delivery.failed ?? 0,
	});
}

function startSchedulerResync(): void {
	schedulerResyncTimer = setInterval(() => {
		syncSchedulers().catch((error) => {
			captureError(error, { error_step: "scheduler_resync" });
		});
		reportQueueDepths().catch((error) => {
			captureError(error, { error_step: "queue_depth_report" });
		});
	}, SCHEDULER_RESYNC_INTERVAL_MS);
}

(async () => {
	if (UPTIME_ENV.isProduction) {
		try {
			await syncSchedulers();
			uptimeDeliveryWorker = startUptimeDeliveryWorker();
			uptimeWorker = startUptimeWorker();
			startSchedulerResync();
		} catch (error) {
			captureError(error, {
				lifecycle: "startup",
				error_step: "uptime_startup",
			});
			await shutdown("startup", 1);
		}
	} else {
		log.info(
			"lifecycle",
			`${UPTIME_ENV.environment} mode — worker and scheduler sync disabled`
		);
	}
})();

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

type ProbeResult =
	| { status: "ok"; latency_ms: number }
	| { status: "error"; latency_ms: number; code: "UNAVAILABLE" };

async function probe(
	name: string,
	fn: () => Promise<unknown>
): Promise<ProbeResult> {
	const start = performance.now();
	try {
		await withTimeout(fn(), PROBE_TIMEOUT_MS, name);
		return { status: "ok", latency_ms: Math.round(performance.now() - start) };
	} catch (error) {
		log.error({
			health_probe: name,
			error_message: error instanceof Error ? error.message : String(error),
		});
		return {
			status: "error",
			latency_ms: Math.round(performance.now() - start),
			code: "UNAVAILABLE",
		};
	}
}

async function pingClickHouse(): Promise<void> {
	const { success } = await clickHouse.ping({
		abort_signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
		select: false,
	});
	if (!success) {
		throw new Error("ping failed");
	}
}

async function runHealthCheck() {
	const deliveryService = readBooleanEnv("SELFHOST")
		? "clickhouse"
		: "redpanda";
	const [postgres, bullmqRedis, delivery] = await Promise.all([
		probe("postgres", () => db.execute(sql`SELECT 1`)),
		probe("bullmqRedis", () => getUptimeQueue().count()),
		probe(
			deliveryService,
			deliveryService === "clickhouse" ? pingClickHouse : pingRedpanda
		),
	]);

	const services = { postgres, bullmqRedis, [deliveryService]: delivery };
	const status = Object.values(services).every((s) => s.status === "ok")
		? "ok"
		: "degraded";
	return { status, services };
}

const HEALTH_CACHE_MS = 10_000;
let healthCache: {
	at: number;
	result: Awaited<ReturnType<typeof runHealthCheck>>;
} | null = null;

async function memoizedHealthCheck() {
	if (healthCache && performance.now() - healthCache.at < HEALTH_CACHE_MS) {
		return healthCache.result;
	}
	const result = await runHealthCheck();
	healthCache = { at: performance.now(), result };
	return result;
}

const app = new Elysia()
	.use(
		evlog({
			enrich: enrichUptimeWideEvent,
		})
	)
	.onError(function handleError({ error, code }) {
		const { payload, status } = buildHttpErrorResponse({ code, error });
		const event: Record<string, string | number | boolean> = {
			error_step: "elysia",
			status,
		};
		if (code != null) {
			event.elysia_code = String(code);
		}
		if (status >= 500) {
			captureError(error, event);
		} else {
			log.warn({
				...event,
				error_message: error instanceof Error ? error.message : String(error),
			});
		}
		return Response.json(payload, { status });
	})
	.get("/health/status", async () => {
		const result = await memoizedHealthCheck();
		return Response.json(result, {
			status: result.status === "ok" ? 200 : 503,
		});
	})
	.get("/health", () => ({ status: "ok" }));

export default {
	port: Number(process.env.PORT ?? 4000),
	fetch: app.fetch,
};
