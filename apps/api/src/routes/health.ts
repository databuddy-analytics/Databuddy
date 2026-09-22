import { db, sql } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { redis } from "@databuddy/redis";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

// The backup job runs hourly. Two missed runs is the smallest window that is
// not a single transient failure, and it is what turns a multi-day silent
// outage into a one-hour one.
const BACKUP_MAX_AGE_MINUTES = 120;

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
	.get("/health/backups", async () => {
		try {
			const rows = await chQuery<{ age_minutes: string | null }>(
				`SELECT dateDiff('minute', max(created_at), now()) AS age_minutes
				 FROM internal.databuddy_backups
				 WHERE status = 'completed'`
			);
			// A null age means no completed backup exists at all, which is the
			// worst case rather than a missing reading.
			const raw = rows[0]?.age_minutes ?? null;
			const ageMinutes = raw === null ? null : Number(raw);
			const fresh = ageMinutes !== null && ageMinutes <= BACKUP_MAX_AGE_MINUTES;

			return Response.json(
				{
					status: fresh ? "ok" : "stale",
					age_minutes: ageMinutes,
					max_age_minutes: BACKUP_MAX_AGE_MINUTES,
				},
				{ status: fresh ? 200 : 503 }
			);
		} catch (err) {
			useLogger().warn("Backup freshness probe unavailable", {
				error_message: err instanceof Error ? err.message : String(err),
			});
			return Response.json(
				{ status: "unknown", code: "UNAVAILABLE" },
				{ status: 503 }
			);
		}
	})
	.get("/health", () => Response.json({ status: "ok" }));
