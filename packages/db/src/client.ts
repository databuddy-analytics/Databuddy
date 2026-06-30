/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { relations } from "./drizzle/schema/relations";

type DB = NodePgDatabase<typeof relations>;

const DEFAULT_POOL_MAX = 30;
const DEFAULT_CONNECTION_TIMEOUT_MS = 2000;

let _pgErrorFn: ((error: Error) => void) | null = null;

export function setPgErrorFn(fn: (error: Error) => void) {
	_pgErrorFn = fn;
}

let _pgTimingFn: ((durationMs: number) => void) | null = null;

export function setPgTimingFn(fn: (durationMs: number) => void) {
	_pgTimingFn = fn;
}

function timePoolQueries(pool: Pool): void {
	const originalQuery = pool.query.bind(pool) as (
		...args: unknown[]
	) => unknown;
	pool.query = ((...args: unknown[]) => {
		const timingFn = _pgTimingFn;
		if (!timingFn) {
			return originalQuery(...args);
		}
		const startedAt = performance.now();
		const result = originalQuery(...args);
		if (result instanceof Promise) {
			const record = () => timingFn(performance.now() - startedAt);
			result.then(record, record);
		}
		return result;
	}) as Pool["query"];
}

function connectionStringForNodePg(connectionString: string): string {
	try {
		const parsed = new URL(connectionString);
		if (parsed.searchParams.get("sslrootcert") === "system") {
			parsed.searchParams.delete("sslrootcert");
		}
		return parsed.toString();
	} catch {
		return connectionString;
	}
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}
	return fallback;
}

let _db: DB | null = null;
let _pool: Pool | null = null;

function getDb(): DB {
	if (!_db) {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set");
		}

		_pool = new Pool({
			connectionString: connectionStringForNodePg(databaseUrl),
			max: parsePositiveInt(process.env.DB_POOL_MAX, DEFAULT_POOL_MAX),
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: parsePositiveInt(
				process.env.DB_CONNECTION_TIMEOUT_MS,
				DEFAULT_CONNECTION_TIMEOUT_MS
			),
			application_name: process.env.SERVICE_NAME || "databuddy",
		});
		timePoolQueries(_pool);
		_pool.on("error", (error) => {
			if (_pgErrorFn) {
				_pgErrorFn(error);
				return;
			}
			console.error("[db] postgres pool error", error);
		});

		_db = drizzle({ client: _pool, relations, jit: true });
	}
	return _db;
}

export async function warmPool(): Promise<void> {
	getDb();
	if (!_pool) {
		return;
	}
	const client = await _pool.connect();
	client.release();
}

export async function shutdownPostgres(): Promise<void> {
	const pool = _pool;
	_db = null;
	_pool = null;
	if (!pool) {
		return;
	}
	await pool.end();
}

export const db = new Proxy({} as DB, {
	get(_, prop) {
		return Reflect.get(getDb(), prop);
	},
});
