import { db, sql } from "@databuddy/db";
import { chQuery } from "@databuddy/db/clickhouse";
import { cacheable, redis } from "@databuddy/redis";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

// created_at is stamped when a run starts, so this budget spans two hourly
// runs plus the slowest observed backup rather than two runs exactly.
const STALE_BACKUP_AFTER_MINUTES = 150;
const BACKUP_PROBE_TIMEOUT_MS = 4000;
const MISSING_TABLE_CODES = ["UNKNOWN_TABLE", "UNKNOWN_DATABASE"];

type BackupFreshness =
	| { state: "measured"; ageMinutes: number }
	| { state: "never" }
	| { state: "unconfigured" };

const readBackupFreshness = cacheable(
	async function readBackupFreshness(): Promise<BackupFreshness> {
		try {
			const rows = await chQuery<{ started_at: number }>(
				`SELECT toUnixTimestamp(max(created_at)) AS started_at
				 FROM internal.databuddy_backups
				 WHERE status = 'completed'`,
				undefined,
				{
					abort_signal: AbortSignal.timeout(BACKUP_PROBE_TIMEOUT_MS),
					label: "health.backups",
					readonly: true,
				}
			);
			// max() over no rows yields the DateTime zero value, not NULL.
			const startedAt = Number(rows[0]?.started_at ?? 0);
			if (startedAt === 0) {
				return { state: "never" };
			}
			return {
				state: "measured",
				ageMinutes: Math.round((Date.now() / 1000 - startedAt) / 60),
			};
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (MISSING_TABLE_CODES.some((code) => message.includes(code))) {
				return { state: "unconfigured" };
			}
			throw err;
		}
	},
	{ expireInSec: 60, prefix: "health:backups", reviveDates: false }
);

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
		let freshness: BackupFreshness;
		try {
			freshness = await readBackupFreshness();
		} catch (err) {
			useLogger().warn("Backup freshness probe unavailable", {
				error_message: err instanceof Error ? err.message : String(err),
			});
			// 500, not 503: the probe failed, which is a different alert from
			// backups being known-stale.
			return Response.json(
				{ status: "probe_failed", code: "UNAVAILABLE" },
				{ status: 500 }
			);
		}

		// Self-hosters without the backup job have no table to read, so this
		// must not page them forever.
		if (freshness.state === "unconfigured") {
			return Response.json({ status: "unconfigured" });
		}

		const ageMinutes =
			freshness.state === "measured" ? freshness.ageMinutes : null;
		const fresh =
			ageMinutes !== null && ageMinutes <= STALE_BACKUP_AFTER_MINUTES;

		return Response.json(
			{
				status: fresh ? "ok" : "stale",
				age_minutes: ageMinutes,
				stale_after_minutes: STALE_BACKUP_AFTER_MINUTES,
			},
			{ status: fresh ? 200 : 503 }
		);
	})
	.get("/health", () => Response.json({ status: "ok" }));
