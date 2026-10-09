import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COLUMN_NAME_PATTERN = /^`?(\w+)`?\s+/;
const COMPUTED_PATTERN = /\b(?:MATERIALIZED|ALIAS)\b/i;
const DEFAULT_PATTERN = /\b(?:DEFAULT|EPHEMERAL)\b/i;
const INDEX_NAME_PATTERN = /^INDEX\s+`?(\w+)`?\s+/i;
const LOW_CARDINALITY_PATTERN = /^LowCardinality\((.*)\)$/i;
const MATERIALIZED_VIEW_PATTERN = /MATERIALIZED\s+VIEW/i;
const NULLABLE_PATTERN = /^Nullable\(/i;
const QUALIFIED_NAME_PATTERN =
	/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`([^`]+)`|(\w+))\.(?:`([^`]+)`|(\w+))/i;
const TABLE_NAME_PATTERN =
	/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.]*\.(\w+)/i;

export interface ParsedColumn {
	computed: boolean;
	definition: string;
	hasDefault: boolean;
	name: string;
	nullable: boolean;
	type: string;
}

interface ParsedIndex {
	definition: string;
	name: string;
}

export function isNullable(type: string): boolean {
	const inner = type.replace(LOW_CARDINALITY_PATTERN, "$1").trim();
	return NULLABLE_PATTERN.test(inner);
}

export interface ParsedTable {
	columns: ParsedColumn[];
	engine: string;
	indexes: ParsedIndex[];
	isView: boolean;
	name: string;
	orderBy: string;
	partitionBy: string;
	primaryKey: string;
	settings: string;
	ttl: string;
}

export function sqlFiles(dir: string, includeViews = true): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...sqlFiles(full, includeViews));
		} else if (
			entry.endsWith(".sql") &&
			(includeViews || !entry.endsWith("_mv.sql"))
		) {
			out.push(full);
		}
	}
	return out.sort();
}

function firstParenGroup(sql: string): { body: string; end: number } {
	const start = sql.indexOf("(");
	let depth = 0;
	for (let i = start; i < sql.length; i++) {
		if (sql[i] === "(") {
			depth++;
		} else if (sql[i] === ")") {
			depth--;
			if (depth === 0) {
				return { body: sql.slice(start + 1, i), end: i };
			}
		}
	}
	throw new Error("Unbalanced parentheses in DDL");
}

function splitTopLevel(body: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of body) {
		if (ch === "(") {
			depth++;
			cur += ch;
		} else if (ch === ")") {
			depth--;
			cur += ch;
		} else if (ch === "," && depth === 0) {
			parts.push(cur.trim());
			cur = "";
		} else {
			cur += ch;
		}
	}
	if (cur.trim()) {
		parts.push(cur.trim());
	}
	return parts;
}

const COLUMN_MODIFIERS =
	/\s+(?:DEFAULT|MATERIALIZED|ALIAS|EPHEMERAL|CODEC|TTL|COMMENT)\b/i;
const NON_COLUMN = /^(?:INDEX|CONSTRAINT|PROJECTION|PRIMARY\s+KEY)\b/i;

export function tableNameOf(sql: string): string {
	const name = sql.match(TABLE_NAME_PATTERN)?.[1];
	if (name === undefined) {
		throw new Error("Could not parse table name");
	}
	return name;
}

export function qualifiedNameOf(sql: string): string {
	const m = sql.match(QUALIFIED_NAME_PATTERN);
	if (!m) {
		throw new Error("Could not parse qualified table name");
	}
	const db = m[1] ?? m[2];
	const table = m[3] ?? m[4];
	return `${db}.${table}`;
}

export function parseColumns(sql: string): ParsedColumn[] {
	const cols: ParsedColumn[] = [];
	for (const item of splitTopLevel(firstParenGroup(sql).body)) {
		if (NON_COLUMN.test(item)) {
			continue;
		}
		const nameMatch = item.match(COLUMN_NAME_PATTERN);
		const name = nameMatch?.[1];
		if (!nameMatch || name === undefined) {
			continue;
		}
		const afterName = item.slice(nameMatch[0].length);
		const modAt = afterName.search(COLUMN_MODIFIERS);
		const type = (modAt === -1 ? afterName : afterName.slice(0, modAt)).trim();
		cols.push({
			name,
			type,
			nullable: isNullable(type),
			hasDefault: DEFAULT_PATTERN.test(afterName),
			computed: COMPUTED_PATTERN.test(afterName),
			definition: item,
		});
	}
	return cols;
}

function normalizeDefinition(definition: string): string {
	return definition.replaceAll("`", "").replace(/\s+/g, " ").trim();
}

function parseIndexes(sql: string): ParsedIndex[] {
	const indexes: ParsedIndex[] = [];
	for (const item of splitTopLevel(firstParenGroup(sql).body)) {
		const match = item.match(INDEX_NAME_PATTERN);
		const name = match?.[1];
		if (!match || name === undefined) {
			continue;
		}
		indexes.push({
			name,
			definition: normalizeDefinition(item.slice(match[0].length)),
		});
	}
	return indexes;
}

const QUOTED_PATTERN = /'(?:[^'\\]|\\.|'')*'|`[^`]*`/g;

// ClickHouse stores `INTERVAL 90 DAYS` and `INTERVAL '90 day'` as
// `toIntervalDay(90)`, keeps a quoted amount quoted, and drops the default
// DELETE action.
const TTL_CANONICAL_PATTERN = new RegExp(
	`(${QUOTED_PATTERN.source})|\\bINTERVAL\\s+(?:'(\\d+)\\s+([a-z]+?)s?'|('\\d+'|\\d+)\\s+([a-z]+?)s?\\b)|\\s+DELETE(?=\\s+WHERE\\s|\\s*,|$)`,
	"gi"
);

function canonicalTtl(ttl: string): string {
	return ttl.replace(
		TTL_CANONICAL_PATTERN,
		(
			_match: string,
			quoted: string | undefined,
			spanAmount: string | undefined,
			spanUnit: string | undefined,
			amount: string | undefined,
			unit: string | undefined
		) => {
			if (quoted !== undefined) {
				return quoted;
			}
			const intervalUnit = spanUnit ?? unit;
			if (intervalUnit === undefined) {
				return "";
			}
			return `toInterval${intervalUnit[0]?.toUpperCase()}${intervalUnit.slice(1).toLowerCase()}(${spanAmount ?? amount})`;
		}
	);
}

function clause(
	tail: string,
	masked: string,
	keyword: string,
	stops: string[]
): string {
	const start = new RegExp(`(?:^|\\s)${keyword}\\s`, "i").exec(masked);
	if (!start) {
		return "";
	}
	const from = start.index + start[0].length;
	const end = stops.length
		? masked.slice(from).search(new RegExp(`\\s(?:${stops.join("|")})\\s`, "i"))
		: -1;
	return tail.slice(from, end === -1 ? undefined : from + end).trim();
}

export function parseTable(sql: string): ParsedTable {
	const name = tableNameOf(sql);
	const isView = MATERIALIZED_VIEW_PATTERN.test(sql);
	const columns = parseColumns(sql);
	const indexes = parseIndexes(sql);
	const tail = sql
		.slice(firstParenGroup(sql).end + 1)
		.replace(/\s+/g, " ")
		.trim();
	const masked = tail.replace(QUOTED_PATTERN, (quoted) =>
		"_".repeat(quoted.length)
	);
	return {
		name,
		isView,
		columns,
		indexes,
		engine: clause(tail, masked, "ENGINE\\s*=", [
			"PARTITION BY",
			"PRIMARY KEY",
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		partitionBy: clause(tail, masked, "PARTITION BY", [
			"PRIMARY KEY",
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		primaryKey: clause(tail, masked, "PRIMARY KEY", [
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		orderBy: clause(tail, masked, "ORDER BY", [
			"PRIMARY KEY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		settings: clause(tail, masked, "SETTINGS", []),
		ttl: canonicalTtl(clause(tail, masked, "TTL", ["SETTINGS"])),
	};
}

export function readSql(file: string): string {
	return readFileSync(file, "utf8");
}
