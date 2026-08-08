import { shutdownPostgres } from "@databuddy/db";
import { closeUptimeQueue } from "@databuddy/redis";
import { buildHttpErrorResponse } from "@databuddy/shared/http-error-response";
import {
	createDatabuddyEvlogEnv,
	databuddyEvlogRedaction,
} from "@databuddy/shared/evlog-redaction";
import { Elysia } from "elysia";
import { Effect } from "effect";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { UPTIME_ENV } from "./lib/env";
import {
	enrichUptimeWideEvent,
	flushBatchedUptimeDrain,
	uptimeLoggerDrain,
} from "./lib/evlog-uptime";
import { disconnectProducer } from "./lib/producer";
import { captureError } from "./lib/tracing";
import { syncSchedulers } from "./sync-schedulers";
import { startUptimeDeliveryWorker, startUptimeWorker } from "./worker";

initLogger({
	env: createDatabuddyEvlogEnv("uptime"),
	redact: databuddyEvlogRedaction,
	drain: uptimeLoggerDrain,
	sampling: {},
});

let shuttingDown = false;
let shutdownExitCode = 0;
let uptimeWorker: ReturnType<typeof startUptimeWorker> | null = null;
let uptimeDeliveryWorker: ReturnType<typeof startUptimeDeliveryWorker> | null =
	null;

process.on("unhandledRejection", (reason, _promise) => {
	captureError(reason, { process: "unhandledRejection" });
	log.error({
		process: "unhandledRejection",
		reason: reason instanceof Error ? reason.message : String(reason),
	});
});

process.on("uncaughtException", (error) => {
	captureError(error, { process: "uncaughtException" });
	log.error({
		process: "uncaughtException",
		error_message: error instanceof Error ? error.message : String(error),
		error_stack: error instanceof Error ? error.stack : undefined,
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

const DRAIN_TIMEOUT_MS = 10_000;

const drainStep = (step: string, action: () => Promise<void>) =>
	Effect.tryPromise({
		try: action,
		catch: (cause) => cause,
	}).pipe(
		Effect.catch((cause) =>
			Effect.sync(() =>
				log.error({
					lifecycle: "shutdown",
					error_step: step,
					error_message: cause instanceof Error ? cause.message : String(cause),
				})
			)
		)
	);

const drainAll = (
	worker: ReturnType<typeof startUptimeWorker> | null,
	deliveryWorker: ReturnType<typeof startUptimeDeliveryWorker> | null
) =>
	Effect.gen(function* () {
		// Stop source admission before closing the relay, preserving queued events
		// for the next worker process if the shutdown window expires.
		yield* drainStep(
			"uptime_worker_close",
			() => worker?.close() ?? Promise.resolve()
		);
		yield* drainStep(
			"uptime_delivery_worker_close",
			() => deliveryWorker?.close() ?? Promise.resolve()
		);
		yield* Effect.all(
			[
				drainStep("uptime_queue_close", () => closeUptimeQueue()),
				drainStep("uptime_log_flush", () => flushBatchedUptimeDrain()),
				drainStep("uptime_postgres_close", () => shutdownPostgres()),
				drainStep("uptime_producer_disconnect", () => disconnectProducer()),
			],
			{ concurrency: "unbounded" }
		);
	}).pipe(
		Effect.timeout(`${DRAIN_TIMEOUT_MS} millis`),
		Effect.catch((cause) =>
			Effect.sync(() =>
				log.error({
					lifecycle: "shutdown",
					error_step:
						cause &&
						typeof cause === "object" &&
						"_tag" in cause &&
						cause._tag === "TimeoutError"
							? "drain_timeout"
							: "drain_failed",
					drain_timeout_ms: DRAIN_TIMEOUT_MS,
					error_message: cause instanceof Error ? cause.message : String(cause),
				})
			)
		)
	);

async function shutdown(signal: string, exitCode = 0) {
	shutdownExitCode = Math.max(shutdownExitCode, exitCode);
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	log.info("lifecycle", `${signal} received, shutting down gracefully`);
	try {
		await Effect.runPromise(drainAll(uptimeWorker, uptimeDeliveryWorker));
	} finally {
		process.exit(shutdownExitCode);
	}
}

(async () => {
	if (UPTIME_ENV.isProduction) {
		try {
			await syncSchedulers();
			uptimeDeliveryWorker = startUptimeDeliveryWorker();
			uptimeWorker = startUptimeWorker();
		} catch (error) {
			captureError(error, { error_step: "uptime_startup" });
			log.error({
				lifecycle: "startup",
				error_step: "uptime_startup",
				error_message: error instanceof Error ? error.message : String(error),
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

const probe = (_name: string, fn: () => Promise<void>) =>
	Effect.gen(function* () {
		const start = performance.now();
		const result = yield* Effect.tryPromise({
			try: fn,
			catch: (cause) => cause,
		}).pipe(
			Effect.map(
				(): ProbeResult => ({
					status: "ok",
					latency_ms: Math.round(performance.now() - start),
				})
			),
			Effect.catch(
				(err): Effect.Effect<ProbeResult> =>
					Effect.sync(() => {
						log.error({
							health_probe: _name,
							error_message: err instanceof Error ? err.message : String(err),
						});
						return {
							status: "error",
							latency_ms: Math.round(performance.now() - start),
							code: "UNAVAILABLE",
						};
					})
			)
		);
		return result;
	});

const healthCheck = Effect.gen(function* () {
	const { db, sql } = yield* Effect.promise(() => import("@databuddy/db"));
	const { getUptimeQueue } = yield* Effect.promise(
		() => import("@databuddy/redis")
	);
	const { Kafka } = yield* Effect.promise(() => import("kafkajs"));

	const [postgres, bullmqRedis, redpanda] = yield* Effect.all(
		[
			probe("postgres", () => db.execute(sql`SELECT 1`).then(() => {})),
			probe("bullmqRedis", async () => {
				await getUptimeQueue().count();
			}),
			probe("redpanda", async () => {
				const broker = process.env.REDPANDA_BROKER;
				if (!broker) {
					throw new Error("not configured");
				}
				const kafka = new Kafka({
					clientId: "health",
					brokers: [broker],
					connectionTimeout: 5000,
					...(process.env.REDPANDA_USER &&
						process.env.REDPANDA_PASSWORD && {
							sasl: {
								mechanism: "scram-sha-256",
								username: process.env.REDPANDA_USER,
								password: process.env.REDPANDA_PASSWORD,
							},
							ssl: process.env.REDPANDA_SSL === "true",
						}),
				});
				const admin = kafka.admin();
				try {
					await admin.connect();
				} finally {
					await admin.disconnect().catch(() => {});
				}
			}),
		],
		{ concurrency: "unbounded" }
	);

	const services = { postgres, bullmqRedis, redpanda };
	const status = Object.values(services).every((s) => s.status === "ok")
		? "ok"
		: "degraded";
	return { status, services };
});

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
		const result = await Effect.runPromise(healthCheck);
		return Response.json(result, {
			status: result.status === "ok" ? 200 : 503,
		});
	})
	.get("/health", () => ({ status: "ok" }));

export default {
	port: Number(process.env.PORT ?? 4000),
	fetch: app.fetch,
};
