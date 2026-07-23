import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	isNullable,
	type ParsedColumn,
	parseColumns,
	qualifiedNameOf,
	readSql,
	sqlFiles,
	tableNameOf,
} from "./schema-parse";

const SCHEMA_DIR = join(dirname(fileURLToPath(import.meta.url)), "schema");
const OUT_FILE = join(SCHEMA_DIR, "tables.generated.ts");
const ARRAY_PATTERN = /^Array\((.*)\)$/i;
const BOOL_PATTERN = /^Bool/i;
const DATE_PATTERN = /^(?:Date|DateTime)/i;
const FLOAT_PATTERN = /^Float/i;
const INT_PATTERN = /Int/i;
const LOW_CARDINALITY_PATTERN = /^LowCardinality\((.*)\)$/i;
const NULLABLE_PATTERN = /^Nullable\((.*)\)$/i;

function tsType(rawType: string): string {
	let t = rawType.trim();
	let nullable = false;
	const lc = t.match(LOW_CARDINALITY_PATTERN);
	if (lc) {
		t = lc[1].trim();
	}
	const nul = t.match(NULLABLE_PATTERN);
	if (nul) {
		nullable = true;
		t = nul[1].trim();
	}
	const arr = t.match(ARRAY_PATTERN);
	if (arr) {
		return `${tsType(arr[1])}[]`;
	}
	let base: string;
	if (INT_PATTERN.test(t) || FLOAT_PATTERN.test(t)) {
		base = "number";
	} else if (BOOL_PATTERN.test(t)) {
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

function insertTsType(rawType: string): string {
	let t = rawType.replace(LOW_CARDINALITY_PATTERN, "$1").trim();
	const nul = t.match(NULLABLE_PATTERN);
	if (nul) {
		t = nul[1].trim();
	}
	if (DATE_PATTERN.test(t)) {
		const base = "number | string";
		return isNullable(rawType) ? `${base} | null` : base;
	}
	return tsType(rawType);
}

function rowField(c: ParsedColumn): string {
	return `\t${c.name}: ${tsType(c.type)};`;
}

function insertField(c: ParsedColumn): string {
	const optional = c.nullable || c.hasDefault ? "?" : "";
	return `\t${c.name}${optional}: ${insertTsType(c.type)};`;
}

const tables = sqlFiles(SCHEMA_DIR, false)
	.map((file) => {
		const sql = readSql(file);
		const table = tableNameOf(sql);
		return {
			table,
			qualified: qualifiedNameOf(sql),
			rowIface: `${pascal(table)}Row`,
			insertIface: `${pascal(table)}Insert`,
			cols: parseColumns(sql),
		};
	})
	.sort((a, b) => a.qualified.localeCompare(b.qualified));

const header = `// Generated from packages/db/src/clickhouse/schema/**/*.sql — do not edit by hand.
// Regenerate with \`bun run generate-db\` (repo root) or \`bun run generate\` in packages/db.
// The .sql DDL is the single source of truth; these types mirror it.
//
// <Table>Row:    read shape — every column present (a query returns them all).
// <Table>Insert: write shape — DEFAULT/Nullable columns optional, MATERIALIZED/ALIAS omitted.
`;

const interfaces = tables
	.flatMap((t) => [
		`export interface ${t.rowIface} {\n${t.cols.map(rowField).join("\n")}\n}`,
		`export interface ${t.insertIface} {\n${t.cols
			.filter((c) => !c.computed)
			.map(insertField)
			.join("\n")}\n}`,
	])
	.join("\n\n");

const registry = `export interface ClickHouseTables {\n${tables
	.map((t) => `\t${t.table}: ${t.rowIface};`)
	.join("\n")}\n}`;

const columnsConst = `export const TABLE_COLUMNS = {\n${tables
	.map(
		(t) =>
			`\t"${t.qualified}": [${t.cols.map((c) => `"${c.name}"`).join(", ")}],`
	)
	.join("\n")}\n} as const satisfies Record<string, readonly string[]>;`;

writeFileSync(
	OUT_FILE,
	`${header}\n${interfaces}\n\n${registry}\n\n${columnsConst}\n`
);
console.info(`Generated ${OUT_FILE} (${tables.length} tables)`);
