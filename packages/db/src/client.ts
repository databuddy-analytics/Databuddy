/** biome-ignore-all lint/performance/noNamespaceImport: "Required" */

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import { relations } from "./drizzle/schema/relations";

type DB = NodePgDatabase<typeof relations>;

let _pgErrorFn: ((error: Error) => void) | null = null;

export function setPgErrorFn(fn: (error: Error) => void) {
	_pgErrorFn = fn;
}

let _pgTimingFn: ((durationMs: number) => void) | null = null;

export function setPgTimingFn(fn: (durationMs: number) => void) {
	_pgTimingFn = fn;
}

function timeClientQueries(client: Client, ready: () => Promise<void>): void {
	const originalQuery = client.query.bind(client) as (
		...args: unknown[]
	) => unknown;
	client.query = ((...args: unknown[]) => {
		const timingFn = _pgTimingFn;
		const startedAt = performance.now();
		const result = ready().then(() => originalQuery(...args));
		if (timingFn) {
			const record = () => timingFn(performance.now() - startedAt);
			result.then(record, record);
		}
		return result;
	}) as Client["query"];
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

let _db: DB | null = null;
let _client: Client | null = null;
let _connection: Promise<void> | null = null;

function connectClient(client: Client): Promise<void> {
	if (_connection) {
		return _connection;
	}
	const connection = client.connect().then(() => undefined);
	_connection = connection.catch((error: unknown) => {
		_connection = null;
		throw error;
	});
	return _connection;
}

function getDb(): DB {
	if (!_db) {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			throw new Error("DATABASE_URL is not set");
		}

		const client = new Client({
			connectionString: connectionStringForNodePg(databaseUrl),
			application_name: process.env.SERVICE_NAME || "databuddy",
		});
		_client = client;
		timeClientQueries(client, () => connectClient(client));
		client.on("error", (error) => {
			if (_pgErrorFn) {
				_pgErrorFn(error);
				return;
			}
			console.error("[db] postgres client error", error);
		});

		_db = drizzle({ client, relations, jit: true });
	}
	return _db;
}

export async function warmPostgres(): Promise<void> {
	getDb();
	if (!_client) {
		return;
	}
	await connectClient(_client);
}

export async function shutdownPostgres(): Promise<void> {
	const client = _client;
	_db = null;
	_client = null;
	_connection = null;
	if (!client) {
		return;
	}
	await client.end();
}

export const db = new Proxy({} as DB, {
	get(_, prop) {
		return Reflect.get(getDb(), prop);
	},
});
