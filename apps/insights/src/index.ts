import { setAiRequestLoggerProvider } from "@databuddy/ai/lib/request-logger";
import { isAiGatewayConfigured } from "@databuddy/ai/config/models";
import { db, shutdownPostgres, sql } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	closeInsightsQueue,
	getBullMQWorkerConnectionOptions,
	getInsightsQueue,
	INSIGHTS_JOB_TIMEOUT_MS,
	INSIGHTS_QUEUE_ENV_PREFIX,
	INSIGHTS_QUEUE_NAME,
	type InsightsQueueJobData,
} from "@databuddy/redis";
import {
	createDatabuddyEvlogEnv,
	databuddyEvlogRedaction,
} from "@databuddy/shared/evlog-redaction";
import { Worker } from "bullmq";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
import { processInsightsJob } from "./jobs";
import {
	captureInsightsError,
	emitInsightsEvent,
	flushBatchedInsightsDrain,
	getActiveInsightsLog,
	insightsLoggerDrain,
} from "./lib/evlog-insights";
import {
	ensureInsightsDispatchSchedule,
	ensureInsightsMaintenanceSchedule,
} from "./scheduler";

const workerEnabled = readBooleanEnv("INSIGHTS_WORKER_ENABLED");
const DRAIN_TIMEOUT_MS = 10_000;
const TRANSIENT_REDIS_ERROR =
	/^READONLY |^ERR caller gone|ECONNRESET|Connection is closed|Socket closed unexpectedly/;

initLogger({
	env: createDatabuddyEvlogEnv("insights"),
	redact: databuddyEvlogRedaction,
	drain: insightsLoggerDrain,
	sampling: {},
});

setAiRequestLoggerProvider(getActiveInsightsLog);

process.on("unhandledRejection", (reason) => {
	captureInsightsError(reason, "process.unhandled_rejection", {
		process: "unhandledRejection",
	});
	exitAfterDrain(1);
});

process.on("uncaughtException", (error) => {
	captureInsightsError(error, "process.uncaught_exception", {
		process: "uncaughtException",
		error_source: "process",
	});
	exitAfterDrain(1);
});

let shuttingDown = false;
let insightsWorker: Worker<InsightsQueueJobData> | null = null;

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise,
			new Promise<never>((_, reject) => {
				timeout = setTimeout(
					() => reject(new Error("shutdown timeout")),
					timeoutMs
				);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

async function drainAll() {
	await withTimeout(
		Promise.allSettled([
			insightsWorker?.close() ?? Promise.resolve(),
			closeInsightsQueue(),
			flushBatchedInsightsDrain(),
			shutdownPostgres(),
		]),
		DRAIN_TIMEOUT_MS
	).catch((error) => {
		captureInsightsError(error, "lifecycle.shutdown_failed", {
			lifecycle: "shutdown",
		});
	});
}

function exitAfterDrain(code: number) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	drainAll()
		.catch((error) => {
			captureInsightsError(error, "lifecycle.shutdown_failed", {
				lifecycle: "shutdown",
			});
		})
		.finally(() => process.exit(code));
}

async function shutdown(signal: string) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	emitInsightsEvent("info", "lifecycle.shutdown_requested", {
		lifecycle: "shutdown",
		signal,
	});
	await drainAll();
	process.exit(0);
}

async function startRuntime() {
	emitInsightsEvent("info", "lifecycle.starting", {
		worker_enabled: workerEnabled,
	});
	if (workerEnabled) {
		if (!isAiGatewayConfigured) {
			throw new Error("INSIGHTS_WORKER_ENABLED requires AI_GATEWAY_API_KEY");
		}
		const configuredConcurrency = Number.parseInt(
			process.env.INSIGHTS_WORKER_CONCURRENCY ?? "",
			10
		);
		const concurrency =
			Number.isSafeInteger(configuredConcurrency) && configuredConcurrency > 0
				? configuredConcurrency
				: 2;
		emitInsightsEvent("info", "worker.starting", {
			queue_name: INSIGHTS_QUEUE_NAME,
			concurrency,
			lock_duration_ms: INSIGHTS_JOB_TIMEOUT_MS * 2,
			stalled_interval_ms: INSIGHTS_JOB_TIMEOUT_MS * 3,
		});
		insightsWorker = new Worker<InsightsQueueJobData>(
			INSIGHTS_QUEUE_NAME,
			async (job) => await processInsightsJob(job),
			{
				connection: getBullMQWorkerConnectionOptions({
					envPrefix: INSIGHTS_QUEUE_ENV_PREFIX,
				}),
				concurrency,
				lockDuration: INSIGHTS_JOB_TIMEOUT_MS * 2,
				stalledInterval: INSIGHTS_JOB_TIMEOUT_MS * 3,
			}
		);
		insightsWorker.on("stalled", (jobId) => {
			emitInsightsEvent("warn", "worker.job_stalled", { job_id: jobId });
		});
		insightsWorker.on("error", (error) => {
			const level = TRANSIENT_REDIS_ERROR.test(error.message)
				? "warn"
				: "error";
			emitInsightsEvent(level, "worker.error", {
				error_message: error.message,
				error_stack: error.stack,
			});
		});
		await Promise.all([
			ensureInsightsDispatchSchedule(),
			ensureInsightsMaintenanceSchedule(),
		]);
		emitInsightsEvent("info", "lifecycle.started", {
			worker_enabled: true,
		});
	} else {
		emitInsightsEvent("info", "lifecycle.disabled", {
			worker_enabled: false,
		});
	}
}

startRuntime().catch((error) => {
	captureInsightsError(error, "lifecycle.start_failed", {
		lifecycle: "startup",
	});
	exitAfterDrain(1);
});

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

type ProbeResult =
	| { status: "ok"; latency_ms: number }
	| { status: "error"; latency_ms: number; code: "UNAVAILABLE" };

async function probe(
	name: string,
	fn: () => Promise<void>
): Promise<ProbeResult> {
	const start = performance.now();
	try {
		await fn();
		return { status: "ok", latency_ms: Math.round(performance.now() - start) };
	} catch (error) {
		captureInsightsError(error, "health.probe_failed", {
			health_probe: name,
		});
		return {
			status: "error",
			latency_ms: Math.round(performance.now() - start),
			code: "UNAVAILABLE",
		};
	}
}

const app = new Elysia()
	.onError(({ code, error }) => {
		captureInsightsError(error, "http.error", {
			elysia_code: String(code),
		});
		return Response.json(
			{
				success: false,
				error: "Internal server error",
				code: "INTERNAL_SERVER_ERROR",
			},
			{ status: 500 }
		);
	})
	.get("/health/status", async () => {
		const [postgres, clickhouse, bullmqRedis] = await Promise.all([
			probe("postgres", () => db.execute(sql`SELECT 1`).then(() => {})),
			probe("clickhouse", async () => {
				const { success } = await clickHouse.ping();
				if (!success) {
					throw new Error("ping failed");
				}
			}),
			probe("bullmqRedis", async () => {
				await getInsightsQueue().count();
			}),
		]);

		const services = { postgres, clickhouse, bullmqRedis };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";

		return Response.json(
			{ status, workerEnabled, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => ({ status: "ok", workerEnabled }));

export default {
	port: Number(process.env.PORT ?? 4002),
	fetch: app.fetch,
};
