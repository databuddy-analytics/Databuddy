import { db, shutdownPostgres, sql } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";
import { redis } from "@databuddy/redis";
import { buildHttpErrorResponse } from "@databuddy/shared/http-error-response";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import { Elysia, redirect } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { drain, enrich, flushDrain } from "./lib/logging";
import {
	checkLinkVisitQueueHealth,
	closeLinkVisitDelivery,
	startLinkVisitDeliveryWorker,
} from "./lib/link-visit-delivery";
import { checkProducerHealth, disconnectProducer } from "./lib/producer";
import { redirectRoute } from "./routes/redirect";
import { preloadGeoDatabase } from "./utils/geo";

initLogger({
	env: { service: "links" },
	redact: databuddyEvlogRedaction,
	drain,
	sampling: {
		rates: { info: 20, warn: 50, debug: 5 },
		keep: [{ status: 400 }, { duration: 1500 }],
	},
});

const rootRedirectUrl =
	process.env.LINKS_ROOT_REDIRECT_URL || "https://databuddy.cc";
preloadGeoDatabase();
startLinkVisitDeliveryWorker();

const app = new Elysia()
	.use(evlog({ enrich }))
	.get("/", () => redirect(rootRedirectUrl, 302))
	.get("/health", () => Response.json({ status: "ok" }))
	.onError(({ code, error }) => {
		const { payload, status } = buildHttpErrorResponse({ code, error });
		const event: Record<string, string | number> = {
			error_message: error instanceof Error ? error.message : String(error),
			error_step: "elysia",
			status,
		};
		if (code != null) {
			event.elysia_code = String(code);
		}
		if (status >= 500) {
			log.error(event);
		} else {
			log.warn(event);
		}
		return Response.json(payload, { status });
	})
	.get("/health/status", async () => {
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

		const redpandaProbe = process.env.REDPANDA_BROKER
			? ping("redpanda", checkProducerHealth)
			: Promise.resolve({
					status: "disabled" as const,
					latency_ms: 0,
				});
		const [postgres, clickhouse, cache, deliveryQueue, redpanda] =
			await Promise.all([
				ping("postgres", async () => {
					await db
						.execute(sql`SELECT "deep_link_app" FROM "links" LIMIT 0`)
						.then(() => {});
				}),
				ping("clickhouse", async () => {
					const { success } = await clickHouse.ping();
					if (!success) {
						throw new Error("ping failed");
					}
				}),
				ping("redis", () => redis.ping().then(() => {})),
				ping("link_visit_queue", checkLinkVisitQueueHealth),
				redpandaProbe,
			]);

		const services = {
			postgres,
			clickhouse,
			redis: cache,
			link_visit_queue: deliveryQueue,
			redpanda,
		};
		const ready = [postgres, clickhouse, cache, deliveryQueue].every(
			(service) => service.status === "ok"
		);
		const degraded = ready && redpanda.status === "error";
		return Response.json(
			{
				status: ready ? (degraded ? "degraded" : "ok") : "unavailable",
				services,
			},
			{ status: ready ? 200 : 503 }
		);
	})
	.use(redirectRoute);

const SHUTDOWN_TIMEOUT_MS = 15_000;
let shuttingDown = false;

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
					() => reject(new Error("Links shutdown timed out")),
					timeoutMs
				);
				timeout.unref?.();
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

async function shutdown(signal: string) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	log.info("lifecycle", `${signal} received, shutting down`);
	const { shutdownRedis } = await import("@databuddy/redis");
	let exitCode = 0;
	try {
		await withTimeout(
			(async () => {
				// Stop admission/processing before disconnecting their dependencies.
				await closeLinkVisitDelivery();
				await disconnectProducer();
				await Promise.all([shutdownRedis(), shutdownPostgres()]);
				await flushDrain();
			})(),
			SHUTDOWN_TIMEOUT_MS
		);
	} catch (error) {
		exitCode = 1;
		log.error({
			lifecycle: "shutdown",
			error_message: error instanceof Error ? error.message : String(error),
		});
	}
	process.exit(exitCode);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default { port: 2500, fetch: app.fetch };
