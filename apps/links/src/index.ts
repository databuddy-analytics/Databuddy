import { db, shutdownPostgres, sql } from "@databuddy/db";
import { redis } from "@databuddy/redis";
import { buildHttpErrorResponse } from "@databuddy/shared/http-error-response";
import { databuddyEvlogRedaction } from "@databuddy/shared/evlog-redaction";
import { Elysia, redirect } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { drain, enrich, flushDrain } from "./lib/logging";
import { disconnectProducer } from "./lib/producer";
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

		const [postgres, cache] = await Promise.all([
			ping("postgres", () => db.execute(sql`SELECT 1`).then(() => {})),
			ping("redis", () => redis.ping().then(() => {})),
		]);

		const services = { postgres, redis: cache };
		const ok = Object.values(services).every((s) => s.status === "ok");
		return Response.json(
			{ status: ok ? "ok" : "degraded", services },
			{ status: ok ? 200 : 503 }
		);
	})
	.use(redirectRoute);

async function shutdown(signal: string) {
	log.info("lifecycle", `${signal} received, shutting down`);
	const { shutdownRedis } = await import("@databuddy/redis");
	await Promise.all([
		shutdownRedis().catch((error) =>
			log.error({
				lifecycle: "redisShutdown",
				error_message: error instanceof Error ? error.message : String(error),
			})
		),
		shutdownPostgres().catch((error) =>
			log.error({
				lifecycle: "postgresShutdown",
				error_message: error instanceof Error ? error.message : String(error),
			})
		),
		flushDrain().catch((error) =>
			log.error({
				lifecycle: "drainFlush",
				error_message: error instanceof Error ? error.message : String(error),
			})
		),
		disconnectProducer().catch((error) =>
			log.error({
				lifecycle: "producerDisconnect",
				error_message: error instanceof Error ? error.message : String(error),
			})
		),
	]);
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default { port: 2500, fetch: app.fetch };
