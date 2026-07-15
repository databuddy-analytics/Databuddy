import { setAiRequestLoggerProvider } from "@databuddy/ai/lib/request-logger";
import { db, shutdownPostgres, sql } from "@databuddy/db";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	closeInsightsQueue,
	getInsightsQueue,
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
} from "@databuddy/redis";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import { Elysia } from "elysia";
import { initLogger } from "evlog";
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
	isScheduledDispatchActive,
	removeInsightsSchedules,
} from "./scheduler";
import { startInsightsWorker } from "./worker";

const environment =
	process.env.APP_ENV ??
	process.env.RAILWAY_ENVIRONMENT_NAME ??
	(process.env.NODE_ENV === "development" ? "development" : "production");
const workerEnabled = readBooleanEnv("INSIGHTS_WORKER_ENABLED");
const scheduledDispatchEnabled = isScheduledDispatchActive(workerEnabled);
const DRAIN_TIMEOUT_MS = 10_000;

initLogger({
	env: {
		service: "insights",
		environment,
		region: process.env.RAILWAY_REPLICA_REGION,
		commitHash: process.env.RAILWAY_GIT_COMMIT_SHA,
	},
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
let insightsWorker: ReturnType<typeof startInsightsWorker> | null = null;

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
		scheduled_dispatch_enabled: scheduledDispatchEnabled,
		worker_enabled: workerEnabled,
	});
	if (workerEnabled) {
		await Promise.all([
			ensureInsightsDispatchSchedule(),
			ensureInsightsMaintenanceSchedule(),
		]);
		insightsWorker = startInsightsWorker();
		emitInsightsEvent("info", "lifecycle.started", {
			scheduled_dispatch_enabled: scheduledDispatchEnabled,
			worker_enabled: true,
		});
	} else {
		await removeInsightsSchedules();
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
	fn: () => void | Promise<void>
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
		const [postgres, bullmqRedis, schedulers, worker] = await Promise.all([
			probe("postgres", () => db.execute(sql`SELECT 1`).then(() => {})),
			probe("bullmqRedis", async () => {
				await getInsightsQueue().count();
			}),
			probe("schedulers", async () => {
				const queue = getInsightsQueue();
				const [dispatch, maintenance] = await Promise.all([
					queue.getJobScheduler(INSIGHTS_DISPATCH_JOB_NAME),
					queue.getJobScheduler(INSIGHTS_MAINTENANCE_JOB_NAME),
				]);
				if (Boolean(dispatch) !== scheduledDispatchEnabled) {
					throw new Error("Insight dispatch scheduler state is incorrect");
				}
				if (Boolean(maintenance) !== workerEnabled) {
					throw new Error("Insight maintenance scheduler state is incorrect");
				}
			}),
			probe("worker", () => {
				if (workerEnabled && !insightsWorker?.isRunning()) {
					throw new Error("Insights worker is not running");
				}
			}),
		]);

		const services = { postgres, bullmqRedis, schedulers, worker };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";

		return Response.json(
			{ status, workerEnabled, scheduledDispatchEnabled, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => ({
		status: "ok",
		workerEnabled,
		scheduledDispatchEnabled,
	}));

export default {
	port: Number(process.env.PORT ?? 4002),
	fetch: app.fetch,
};
