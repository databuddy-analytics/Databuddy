/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as relations from "./drizzle/relations";
import * as schema from "./drizzle/schema";

const fullSchema = { ...schema, ...relations };

type DB = NodePgDatabase<typeof fullSchema>;

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

let _db: DB | null = null;

function getDb(): DB {
	if (!_db) {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set");
		}

		const pool = new Pool({
			connectionString: connectionStringForNodePg(databaseUrl),
			max: Number.parseInt(process.env.DB_POOL_MAX ?? "20", 10) || 20,
			idleTimeoutMillis: 30_000,
			connectionTimeoutMillis: 5000,
		});

		_db = drizzle(pool, { schema: fullSchema });
	}
	return _db;
}

export const db = new Proxy({} as DB, {
	get(_, prop) {
		return Reflect.get(getDb(), prop);
	},
});
