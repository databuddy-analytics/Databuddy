import { clickHouseOG, db, sql } from "@databuddy/db";
import { redis } from "@databuddy/redis";
import { Elysia } from "elysia";

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

export const health = new Elysia()
	.get("/health/status", async function healthStatus() {
		const [postgres, clickhouse, cache] = await Promise.all([
			ping(() => db.execute(sql`SELECT 1`).then(() => {})),
			ping(async () => {
				const { success } = await clickHouseOG.ping();
				if (!success) {
					throw new Error("ping failed");
				}
			}),
			ping(() => redis.ping().then(() => {})),
		]);

		const services = { postgres, clickhouse, redis: cache };
		const status = Object.values(services).every((s) => s.status === "ok")
			? "ok"
			: "degraded";

		return Response.json(
			{ status, services },
			{ status: status === "ok" ? 200 : 503 }
		);
	})
	.get("/health", () => Response.json({ status: "ok" }, { status: 200 }));
