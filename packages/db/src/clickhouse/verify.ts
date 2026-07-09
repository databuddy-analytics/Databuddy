import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ParsedTable, parseTable, readSql, sqlFiles } from "./schema-parse";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");
const DATABASES = ["analytics", "uptime"];

const NO_COLOR = Boolean(process.env.NO_COLOR);
const c = {
	red: (s: string) => (NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`),
	green: (s: string) => (NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`),
	yellow: (s: string) => (NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`),
	dim: (s: string) => (NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`),
	bold: (s: string) => (NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`),
};

function dbNameOf(sql: string): string {
	const m = sql.match(
		/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\./i
	);
	return m ? m[1] : "analytics";
}

async function fetchLive(): Promise<Map<string, ParsedTable>> {
	const raw = process.env.CLICKHOUSE_READONLY_URL ?? process.env.CLICKHOUSE_URL;
	if (!raw) {
		throw new Error("CLICKHOUSE_READONLY_URL or CLICKHOUSE_URL must be set");
	}
	const url = new URL(raw);
	const headers: Record<string, string> = {};
	if (url.username) {
		headers.Authorization = `Basic ${btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`;
		url.username = "";
		url.password = "";
	}
	const dbList = DATABASES.map((d) => `'${d}'`).join(",");
	const query = `SELECT database, name, create_table_query FROM system.tables WHERE database IN (${dbList}) AND NOT is_temporary FORMAT JSONEachRow`;
	url.searchParams.set("query", query);
	const res = await fetch(url, { headers });
	if (!res.ok) {
		throw new Error(`ClickHouse query failed: ${res.status} ${await res.text()}`);
	}
	const text = await res.text();
	const live = new Map<string, ParsedTable>();
	for (const line of text.trim().split("\n").filter(Boolean)) {
		const row = JSON.parse(line) as { database: string; create_table_query: string };
		const parsed = parseTable(row.create_table_query);
		live.set(`${row.database}.${parsed.name}`, parsed);
	}
	return live;
}

function diffTable(repo: ParsedTable, live: ParsedTable): string[] {
	const lines: string[] = [];
	const repoCols = new Map(repo.columns.map((col) => [col.name, col.type]));
	const liveCols = new Map(live.columns.map((col) => [col.name, col.type]));

	for (const [name, type] of repoCols) {
		if (!liveCols.has(name)) {
			lines.push(c.green(`    + ${name.padEnd(24)} ${type}`) + c.dim("  (in repo, missing on cluster)"));
		} else if (liveCols.get(name) !== type) {
			lines.push(
				c.yellow(`    ~ ${name.padEnd(24)} `) +
					c.red(live.columns.find((col) => col.name === name)?.type ?? "") +
					c.dim(" → ") +
					c.green(type)
			);
		}
	}
	for (const [name, type] of liveCols) {
		if (!repoCols.has(name)) {
			lines.push(c.red(`    - ${name.padEnd(24)} ${type}`) + c.dim("  (on cluster, missing in repo)"));
		}
	}

	const repoNames = repo.columns.map((col) => col.name).join(",");
	const liveNames = live.columns.map((col) => col.name).join(",");
	if (repoNames !== liveNames && repoCols.size === liveCols.size &&
		[...repoCols.keys()].every((k) => liveCols.has(k))) {
		lines.push(c.yellow("    ~ column order differs"));
	}

	for (const key of ["engine", "partitionBy", "orderBy", "settings"] as const) {
		if (repo[key] !== live[key]) {
			lines.push(
				c.yellow(`    ~ ${key}`) +
					`\n        ${c.red(`cluster: ${live[key] || "(none)"}`)}` +
					`\n        ${c.green(`repo:    ${repo[key] || "(none)"}`)}`
			);
		}
	}
	return lines;
}

const live = await fetchLive();
const repoFiles = sqlFiles(SCHEMA_DIR);
const seenLive = new Set<string>();
let drifted = 0;

for (const file of repoFiles) {
	const sql = readSql(file);
	const key = `${dbNameOf(sql)}.${parseTable(sql).name}`;
	seenLive.add(key);
	const repo = parseTable(sql);
	const liveTable = live.get(key);
	if (!liveTable) {
		console.info(`${c.red("✗")} ${c.bold(key)} ${c.red("— in repo, does not exist on cluster")}`);
		drifted++;
		continue;
	}
	const lines = diffTable(repo, liveTable);
	if (lines.length === 0) {
		console.info(`${c.green("✓")} ${key}`);
	} else {
		console.info(`${c.red("✗")} ${c.bold(key)}`);
		for (const l of lines) {
			console.info(l);
		}
		drifted++;
	}
}

for (const key of live.keys()) {
	if (!seenLive.has(key) && !key.endsWith("_mv")) {
		console.info(`${c.red("✗")} ${c.bold(key)} ${c.red("— on cluster, no .sql in repo")}`);
		drifted++;
	}
}

console.info("");
if (drifted === 0) {
	console.info(c.green(`✓ schema in sync — ${repoFiles.length} objects match the cluster`));
	process.exit(0);
}
console.info(c.red(`✗ ${drifted} object(s) drifted from the cluster`));
process.exit(1);
