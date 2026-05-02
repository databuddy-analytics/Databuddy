import { closeUptimeQueue } from "@databuddy/redis";
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
import { startUptimeWorker } from "./worker";

initLogger({
	env: {
		service: "uptime",
		environment: UPTIME_ENV.environment,
		region: process.env.UNKEY_REGION,
		commitHash: process.env.UNKEY_GIT_COMMIT_SHA,
	},
	drain: uptimeLoggerDrain,
	sampling: {},
});

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
});

const DRAIN_TIMEOUT_MS = 10_000;

const drainAll = (worker: ReturnType<typeof startUptimeWorker> | null) =>
	Effect.all(
		[
			Effect.tryPromise({ try: () => worker?.close() ?? Promise.resolve(), catch: (c) => c }),
			Effect.tryPromise({ try: () => closeUptimeQueue(), catch: (c) => c }),
			Effect.tryPromise({ try: () => flushBatchedUptimeDrain(), catch: (c) => c }),
			Effect.tryPromise({ try: () => disconnectProducer(), catch: (c) => c }),
		],
		{ concurrency: "unbounded" },
	).pipe(
		Effect.timeout(`${DRAIN_TIMEOUT_MS} millis`),
		Effect.catch(() =>
			Effect.sync(() =>
				log.error({
					lifecycle: "shutdown",
					error_step: "drain_timeout",
					drain_timeout_ms: DRAIN_TIMEOUT_MS,
				}),
			),
		),
	);

async function shutdown(signal: string) {
	log.info("lifecycle", `${signal} received, shutting down gracefully`);
	await Effect.runPromise(drainAll(uptimeWorker));
	process.exit(0);
}

let uptimeWorker: ReturnType<typeof startUptimeWorker> | null = null;

(async () => {
	if (UPTIME_ENV.isProduction) {
		await syncSchedulers();
		uptimeWorker = startUptimeWorker();
	} else {
		log.info(
			"lifecycle",
			`${UPTIME_ENV.environment} mode — worker and scheduler sync disabled`,
		);
	}
})();

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

type ProbeResult =
	| { status: "ok"; latency_ms: number }
	| { status: "error"; latency_ms: number; error: string };

const probe = (name: string, fn: () => Promise<void>) =>
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
				}),
			),
			Effect.catch(
				(err): Effect.Effect<ProbeResult> =>
					Effect.succeed({
						status: "error",
						latency_ms: Math.round(performance.now() - start),
						error: err instanceof Error ? err.message : "unknown",
					}),
			),
		);
		return result;
	});

const healthCheck = Effect.gen(function* () {
	const { db, sql } = await import("@databuddy/db");
	const { getUptimeQueue } = await import("@databuddy/redis");
	const { Kafka } = await import("kafkajs");

	const [postgres, bullmqRedis, redpanda] = yield* Effect.all(
		[
			probe("postgres", () => db.execute(sql`SELECT 1`).then(() => {})),
			probe("bullmqRedis", async () => {
				const client = await getUptimeQueue().client;
				await client.ping();
			}),
			probe("redpanda", async () => {
				const broker = process.env.REDPANDA_BROKER;
				if (!broker) throw new Error("not configured");
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
							ssl: false,
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
		{ concurrency: "unbounded" },
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
		}),
	)
	.onError(function handleError({ error, code }) {
		captureError(error, {
			error_step: "elysia",
			elysia_code: String(code),
		});
	})
	.get("/health/status", async () => {
		const result = await Effect.runPromise(healthCheck);
		return Response.json(
			result,
			{ status: result.status === "ok" ? 200 : 503 },
		);
	})
	.get("/health", () => ({ status: "ok" }));

export default {
	port: Number(process.env.PORT ?? 4000),
	fetch: app.fetch,
};
