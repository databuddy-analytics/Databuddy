import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { clickHouse } from "./client";
import { readSql, sqlFiles } from "./schema-parse";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");

const SINGLE_NODE = process.env.CLICKHOUSE_CLUSTER == null;
const DATABASE_PATTERN =
	/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\./i;

function databaseOf(sql: string): string {
	const m = sql.match(DATABASE_PATTERN);
	if (!m) {
		throw new Error(
			`Could not determine database for statement: ${sql.slice(0, 80)}`
		);
	}
	return m[1];
}

function toSingleNode(sql: string): string {
	return sql.replace(
		/ENGINE = Replicated(\w*MergeTree)\(\s*'[^']*'\s*,\s*'[^']*'\s*(?:,\s*)?/g,
		(_match, engine) => `ENGINE = ${engine}(`
	);
}

export async function applyClickHouseSchema(): Promise<{
	databases: string[];
	tables: number;
	views: number;
}> {
	const files = sqlFiles(SCHEMA_DIR);
	const tables = files.filter((f) => !f.endsWith("_mv.sql"));
	const views = files.filter((f) => f.endsWith("_mv.sql"));

	const databases = [
		...new Set(files.map((f) => databaseOf(readSql(f)))),
	].sort();
	for (const db of databases) {
		await clickHouse.command({ query: `CREATE DATABASE IF NOT EXISTS ${db}` });
	}

	for (const file of [...tables, ...views]) {
		let sql = readSql(file);
		if (SINGLE_NODE) {
			sql = toSingleNode(sql);
		}
		await clickHouse.command({ query: sql });
	}

	return { databases, tables: tables.length, views: views.length };
}
