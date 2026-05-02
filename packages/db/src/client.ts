/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./drizzle/schema";

const fullSchema = schema;

type DB = NodePgDatabase<typeof fullSchema>;

let _pgTraceFn: ((durationMs: number) => void) | null = null;

export function setPgTraceFn(fn: (durationMs: number) => void) {
	_pgTraceFn = fn;
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

function wrapQuery(obj: { query: (...args: any[]) => any }): void {
	const original = obj.query.bind(obj);
	obj.query = (...args: unknown[]) => {
		if (!_pgTraceFn) {
			return original(...args);
		}
		const start = performance.now();
		const result = original(...args);
		if (result?.then) {
			return result.then((res: unknown) => {
				_pgTraceFn?.(Math.round((performance.now() - start) * 100) / 100);
				return res;
			});
		}
		return result;
	};
}

function instrumentedPool(pool: Pool): Pool {
	const originalConnect = pool.connect.bind(pool);
	(pool as any).connect = (...args: unknown[]) => {
		const callback = args[0] as
			| ((err: Error | undefined, client: unknown, release: unknown) => void)
			| undefined;
		if (callback) {
			return originalConnect(
				(err: Error | undefined, client: unknown, release: unknown) => {
					if (client && !err) {
						wrapQuery(client as Parameters<typeof wrapQuery>[0]);
					}
					callback(err, client, release);
				}
			);
		}
		return (originalConnect as () => Promise<unknown>)().then((client) => {
			wrapQuery(client as Parameters<typeof wrapQuery>[0]);
			return client;
		});
	};

	wrapQuery(pool);
	return pool;
}

let _db: DB | null = null;
let _pool: Pool | null = null;

function getDb(): DB {
	if (!_db) {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set");
		}

		_pool = instrumentedPool(
			new Pool({
				connectionString: connectionStringForNodePg(databaseUrl),
				max: Number.parseInt(process.env.DB_POOL_MAX ?? "20", 10) || 20,
				idleTimeoutMillis: 30_000,
				connectionTimeoutMillis: 5000,
				application_name: process.env.SERVICE_NAME || "databuddy",
			})
		);

		_db = drizzle(_pool, { schema: fullSchema });
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

export const db = new Proxy({} as DB, {
	get(_, prop) {
		return Reflect.get(getDb(), prop);
	},
});
