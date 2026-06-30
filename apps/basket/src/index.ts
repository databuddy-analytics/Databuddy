import "./polyfills/compression";

import {
	basketLoggerDrain,
	enrichBasketWideEvent,
	flushBatchedAxiomDrain,
} from "@lib/evlog-basket";
import { shutdownPostgres } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { disconnect, disposeRuntime, runPromise } from "@lib/producer";
import { Kafka } from "kafkajs";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import {
	handleUncaughtException,
	handleUnhandledRejection,
} from "@lib/process-errors";
import { buildBasketErrorPayload } from "@lib/structured-errors";
import { captureError } from "@lib/tracing";
import basketRouter from "@routes/basket";
import { trackRoute } from "@routes/track";
import { paddleWebhook } from "@routes/webhooks/paddle";
import { stripeWebhook } from "@routes/webhooks/stripe";
import { closeGeoIPReader } from "@utils/ip-geo";
import { Elysia } from "elysia";
import { initLogger, log } from "evlog";
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

let shutdownStarted = false;

async function gracefulShutdown(signal: string, exitCode = 0) {
	if (shutdownStarted) {
		return;
	}
	shutdownStarted = true;
	log.info("lifecycle", `${signal} received, shutting down gracefully`);
	const logErr = (lifecycle: string) => (error: unknown) =>
		log.error({
			lifecycle,
			error_message: error instanceof Error ? error.message : String(error),
		});
	const { shutdownRedis } = await import("@databuddy/redis");
	await Promise.all([
		shutdownRedis().catch(logErr("redisShutdown")),
		shutdownPostgres().catch(logErr("postgresShutdown")),
		flushBatchedAxiomDrain().catch(logErr("drainFlush")),
		runPromise(disconnect).catch(logErr("shutdown")),
		disposeRuntime().catch(logErr("runtimeDispose")),
	]);
	closeGeoIPReader();
	process.exit(exitCode);
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
	.onError(function handleError({ error, code }) {
		if (code === "NOT_FOUND") {
			return new Response(null, { status: 404 });
		}

		captureError(error);

		const { status, payload } = buildBasketErrorPayload(error, {
			elysiaCode: code ?? "INTERNAL_SERVER_ERROR",
		});

		return new Response(JSON.stringify(payload), {
			status,
			headers: { "Content-Type": "application/json" },
		});
	})
	.options("*", () => new Response(null, { status: 204 }))
	.use(basketRouter)
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

		const [clickhouse, redpanda] = await Promise.all([
			ping("clickhouse", async () => {
				const { success } = await clickHouse.ping();
				if (!success) {
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

		const services = { clickhouse, redpanda };
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
