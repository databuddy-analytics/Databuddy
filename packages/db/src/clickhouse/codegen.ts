import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseColumns, readSql, sqlFiles, tableNameOf } from "./schema-parse";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");
const OUT_FILE = join(SCHEMA_DIR, "tables.generated.ts");

function tsType(rawType: string): string {
	let t = rawType.trim();
	let nullable = false;
	const lc = t.match(/^LowCardinality\((.*)\)$/i);
	if (lc) {
		t = lc[1].trim();
	}
	const nul = t.match(/^Nullable\((.*)\)$/i);
	if (nul) {
		nullable = true;
		t = nul[1].trim();
	}
	const arr = t.match(/^Array\((.*)\)$/i);
	if (arr) {
		return `${tsType(arr[1])}[]`;
	}
	let base: string;
	if (/Int/i.test(t) || /^Float/i.test(t)) {
		base = "number";
	} else if (/^Bool/i.test(t)) {
		base = "boolean";
	} else {
		base = "string";
	}
	return nullable ? `${base} | null` : base;
}

function pascal(name: string): string {
	return name
		.split("_")
		.map((p) => p.charAt(0).toUpperCase() + p.slice(1))
		.join("");
}

const tables = sqlFiles(SCHEMA_DIR, false)
	.map((file) => {
		const sql = readSql(file);
		const table = tableNameOf(sql);
		return {
			table,
			iface: `${pascal(table)}Row`,
			cols: parseColumns(sql).map((c) => ({
				name: c.name,
				type: tsType(c.type),
			})),
		};
	})
	.sort((a, b) => a.table.localeCompare(b.table));

const header = `// Generated from packages/db/src/clickhouse/schema/**/*.sql — do not edit by hand.
// Regenerate with \`bun run generate-db\` (repo root) or \`bun run generate\` in packages/db.
// The .sql DDL is the single source of truth; these types mirror it.
`;

const interfaces = tables
	.map(
		(t) =>
			`export interface ${t.iface} {\n${t.cols
				.map((c) => `\t${c.name}: ${c.type};`)
				.join("\n")}\n}`
	)
	.join("\n\n");

const registry = `export interface ClickHouseTables {\n${tables
	.map((t) => `\t${t.table}: ${t.iface};`)
	.join("\n")}\n}`;

writeFileSync(OUT_FILE, `${header}\n${interfaces}\n\n${registry}\n`);
console.info(`Generated ${OUT_FILE} (${tables.length} tables)`);
