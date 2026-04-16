import { Elysia, redirect } from "elysia";
import { initLogger, log } from "evlog";
import { evlog } from "evlog/elysia";
import { drain, enrich, flushDrain } from "./lib/logging";
import { disconnectProducer } from "./lib/producer";
import { redirectRoute } from "./routes/redirect";

initLogger({
	env: { service: "links" },
	drain,
	sampling: { rates: { info: 20, warn: 50, debug: 5 } },
});

const app = new Elysia()
	.use(evlog({ enrich }))
	.get("/", () => redirect("https://databuddy.cc", 302))
	.get("/health", () => Response.json({ status: "ok" }))
	.get("/health/status", async () => {
		const { db, sql } = await import("@databuddy/db");
		const { redis } = await import("@databuddy/redis");

		async function ping(probe: () => Promise<void>) {
			const start = performance.now();
			try {
				await probe();
				return {
					status: "ok" as const,
					latency_ms: Math.round(performance.now() - start),
				};
			} catch (err) {
				return {
					status: "error" as const,
					latency_ms: Math.round(performance.now() - start),
					error: err instanceof Error ? err.message : "unknown",
				};
			}
		}

		const [postgres, cache] = await Promise.all([
			ping(() => db.execute(sql`SELECT 1`).then(() => {})),
			ping(() => redis.ping().then(() => {})),
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
	await flushDrain().catch((error) =>
		log.error({
			lifecycle: "drainFlush",
			error_message: error instanceof Error ? error.message : String(error),
		})
	);
	await disconnectProducer();
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default { port: 2500, fetch: app.fetch };
