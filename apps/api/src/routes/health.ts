import { db, sql } from "@databuddy/db";
import { clickHouseOG } from "@databuddy/db/clickhouse";
import { redis } from "@databuddy/redis";
import { Elysia } from "elysia";

type PingResult =
	| { status: "ok"; latency_ms: number }
	| { status: "error"; latency_ms: number; error: string };

async function ping(probe: () => Promise<unknown>): Promise<PingResult> {
	const start = performance.now();
	try {
		await probe();
		return {
			status: "ok",
			latency_ms: Math.round(performance.now() - start),
		};
	} catch (err) {
		return {
			status: "error",
			latency_ms: Math.round(performance.now() - start),
			error: err instanceof Error ? err.message : "unknown",
		};
	}
}

export const health = new Elysia()
	.get("/health/status", async () => {
		const [postgres, clickhouse, cache] = await Promise.all([
			ping(() => db.execute(sql`SELECT 1`)),
			ping(async () => {
				const { success } = await clickHouseOG.ping();
				if (!success) {
					throw new Error("ping failed");
				}
			}),
			ping(() => redis.ping()),
		]);

		const services = { postgres, clickhouse, redis: cache };
		const allOk = Object.values(services).every((s) => s.status === "ok");
		const status = allOk ? "ok" : "degraded";

		return Response.json({ status, services }, { status: allOk ? 200 : 503 });
	})
	.get("/health", () => Response.json({ status: "ok" }));
