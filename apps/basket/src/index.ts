import "./polyfills/compression";

import {
	basketLoggerDrain,
	enrichBasketWideEvent,
	flushBatchedAxiomDrain,
} from "@lib/evlog-basket";
import { shutdownPostgres } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { getRedisCache } from "@databuddy/redis/redis";
import {
	disconnect,
	disposeRuntime,
	runPromise,
	ShutdownDrainError,
} from "@lib/producer";
import { Kafka } from "kafkajs";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import {
	handleUncaughtException,
	handleUnhandledRejection,
} from "@lib/process-errors";
import { sanitizeRequestId } from "@lib/request-id";
import { buildBasketErrorPayload } from "@lib/structured-errors";
import { captureError } from "@lib/tracing";
import basketRouter from "@routes/basket";
import { identifyRoute } from "@routes/identify";
import { trackRoute } from "@routes/track";
import { paddleWebhook } from "@routes/webhooks/paddle";
import { stripeWebhook } from "@routes/webhooks/stripe";
import { closeGeoIPReader } from "@utils/ip-geo";
import { Elysia } from "elysia";
import { EvlogError, initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";

initLogger({
	env: { service: "basket" },
	redact: databuddyEvlogRedaction,
	drain: basketLoggerDrain,
	sampling: {
		rates: { info: 20, warn: 50, debug: 5 },
		keep: [{ status: 400 }, { duration: 1500 }],
	},
});

if (
	process.env.NODE_ENV === "production" &&
	!process.env.DATABUDDY_ENCRYPTION_KEY?.trim()
) {
	throw new Error("DATABUDDY_ENCRYPTION_KEY is required in production");
}

if (!process.env.DATABUDDY_ENCRYPTION_KEY) {
	log.warn({
		message:
			"DATABUDDY_ENCRYPTION_KEY is not set — profile display names and emails will be stored unencrypted",
	});
}

const SHUTDOWN_TIMEOUT_MS = 10_000;
let shutdownStarted = false;

async function gracefulShutdown(signal: string, exitCode = 0) {
	if (shutdownStarted) {
		return;
	}
	shutdownStarted = true;
	const timeout = setTimeout(() => {
		log.error({
			lifecycle: "shutdown",
			signal,
			message: "Graceful shutdown timed out",
		});
		process.exit(1);
	}, SHUTDOWN_TIMEOUT_MS);
	timeout.unref?.();

	let finalExitCode = exitCode;
	try {
		log.info("lifecycle", `${signal} received, shutting down gracefully`);
		const logErr = (lifecycle: string) => (error: unknown) =>
			log.error({
				lifecycle,
				error_message: error instanceof Error ? error.message : String(error),
			});
		const { shutdownRedis } = await import("@databuddy/redis");
		// Wait for acknowledged delivery before tearing down its dependencies.
		try {
			await runPromise(disconnect);
		} catch (error) {
			finalExitCode = 1;
			if (error instanceof ShutdownDrainError) {
				log.error({
					lifecycle: "producerDrain",
					error_message:
						"Basket producer drain timed out waiting for in-flight delivery",
					in_flight: error.inFlight,
					drain_timeout_ms: error.deadlineMs,
				});
			} else {
				logErr("producerDrain")(error);
			}
		} finally {
			try {
				await disposeRuntime();
			} catch (error) {
				finalExitCode = 1;
				logErr("runtimeDispose")(error);
			}
		}
		await Promise.all([
			shutdownRedis().catch(logErr("redisShutdown")),
			shutdownPostgres().catch(logErr("postgresShutdown")),
		]);
		await flushBatchedAxiomDrain().catch(logErr("drainFlush"));
		closeGeoIPReader();
	} catch (error) {
		finalExitCode = 1;
		log.error({
			lifecycle: "shutdown",
			signal,
			error_message: error instanceof Error ? error.message : String(error),
		});
	} finally {
		clearTimeout(timeout);
		process.exit(finalExitCode);
	}
}

process.on("unhandledRejection", (reason) => {
	handleUnhandledRejection(reason, gracefulShutdown);
});
process.on("uncaughtException", (error) => {
	handleUncaughtException(error, gracefulShutdown);
});
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

const app = new Elysia()
	.use(
		evlog({
			enrich: enrichBasketWideEvent,
		})
	)
	.onBeforeHandle(function handleCors({ request, set }) {
		const origin = request.headers.get("origin");
		if (origin) {
			set.headers ??= {};
			set.headers["Access-Control-Allow-Origin"] = origin;
			set.headers["Access-Control-Allow-Methods"] =
				"POST, GET, OPTIONS, PUT, DELETE";
			set.headers["Access-Control-Allow-Headers"] =
				"Content-Type, Authorization, X-Requested-With, databuddy-client-id, databuddy-sdk-name, databuddy-sdk-version";
			set.headers["Access-Control-Allow-Credentials"] = "true";
		}
	})
	.onError(function handleError({ error, code, request, set }) {
		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}

		const requestId =
			sanitizeRequestId(request.headers.get("x-request-id")) ??
			crypto.randomUUID();
		const isExpectedClientError =
			error instanceof EvlogError && error.status >= 400 && error.status < 500;
		if (!isExpectedClientError) {
			captureError(error, { requestId });
		}

		const { status, payload } = buildBasketErrorPayload(error, {
			elysiaCode: code ?? "INTERNAL_SERVER_ERROR",
			extra: { requestId },
		});
		set.headers["x-request-id"] = requestId;

		return new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	})
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
	.use(identifyRoute)
	.use(trackRoute)
	.use(stripeWebhook)
	.use(paddleWebhook)
	.get("/health/status", async function basketHealthStatus() {
		async function ping(name: string, probe: () => Promise<void>) {
			const start = performance.now();
			try {
				await probe();
				return {
					status: "ok" as const,
					latency_ms: Math.round(performance.now() - start),
				};
			} catch (err) {
				log.error({
					health_probe: name,
					error_message: err instanceof Error ? err.message : String(err),
				});
				return {
					status: "error" as const,
					latency_ms: Math.round(performance.now() - start),
					code: "UNAVAILABLE",
				};
			}
		}

		const [clickhouse, redis, redpanda] = await Promise.all([
			ping("clickhouse", async () => {
				const { success } = await clickHouse.ping();
				if (!success) {
					throw new Error("ping failed");
				}
			}),
			ping("redis", async () => {
				const result = await getRedisCache().ping();
				if (result !== "PONG") {
					throw new Error("ping failed");
				}
			}),
			ping("redpanda", async () => {
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
		]);

		const services = { clickhouse, redis, redpanda };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";
		return Response.json(
			{ status, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => Response.json({ status: "ok" }, { status: 200 }));

const port = process.env.PORT || 4000;

export default {
	fetch: app.fetch,
	port,
	maxRequestBodySize: 2 * 1024 * 1024,
};
