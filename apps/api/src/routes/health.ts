import { db, sql } from "@databuddy/db";
import { redis } from "@databuddy/redis";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

type PingResult =
	| { status: "ok"; latency_ms: number }
	| { status: "error"; latency_ms: number; code: "UNAVAILABLE" };

export async function ping(
	name: string,
	probe: () => Promise<unknown>
): Promise<PingResult> {
	const start = performance.now();
	try {
		await probe();
		return {
			status: "ok",
			latency_ms: Math.round(performance.now() - start),
		};
	} catch (err) {
		useLogger().warn("Health probe unavailable", {
			error_message: err instanceof Error ? err.message : String(err),
			health_probe: name,
		});
		return {
			status: "error",
			latency_ms: Math.round(performance.now() - start),
			code: "UNAVAILABLE",
		};
	}
}

export const health = new Elysia()
	.get("/health/status", async () => {
		const [postgres, cache] = await Promise.all([
			ping("postgres", () => db.execute(sql`SELECT 1`)),
			ping("redis", () => redis.ping()),
		]);

		const services = { postgres, redis: cache };
		const allOk = Object.values(services).every((s) => s.status === "ok");
		const status = allOk ? "ok" : "degraded";

		return Response.json({ status, services }, { status: allOk ? 200 : 503 });
	})
	.get("/health", () => Response.json({ status: "ok" }));
