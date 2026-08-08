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
	const m = sql.match(TABLE_NAME_PATTERN);
	if (!m) {
		throw new Error("Could not parse table name");
	}
	return m[1];
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
		if (!nameMatch) {
			continue;
		}
		const afterName = item.slice(nameMatch[0].length);
		const modAt = afterName.search(COLUMN_MODIFIERS);
		const type = (modAt === -1 ? afterName : afterName.slice(0, modAt)).trim();
		cols.push({
			name: nameMatch[1],
			type,
			nullable: isNullable(type),
			hasDefault: DEFAULT_PATTERN.test(afterName),
			computed: COMPUTED_PATTERN.test(afterName),
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
		if (!match) {
			continue;
		}
		indexes.push({
			name: match[1],
			definition: normalizeDefinition(item.slice(match[0].length)),
		});
	}
	return indexes;
}

function clause(tail: string, keyword: string, stops: string[]): string {
	const lookahead = stops.length ? `(?=(?:${stops.join("|")})\\b|$)` : "(?=$)";
	const re = new RegExp(`${keyword}\\s+([\\s\\S]*?)\\s*${lookahead}`, "i");
	const m = tail.match(re);
	return m ? m[1].trim() : "";
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
	return {
		name,
		isView,
		columns,
		indexes,
		engine: clause(tail, "ENGINE\\s*=", [
			"PARTITION BY",
			"PRIMARY KEY",
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		partitionBy: clause(tail, "PARTITION BY", [
			"PRIMARY KEY",
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		primaryKey: clause(tail, "PRIMARY KEY", [
			"ORDER BY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		orderBy: clause(tail, "ORDER BY", [
			"PRIMARY KEY",
			"SAMPLE BY",
			"TTL",
			"SETTINGS",
		]),
		settings: clause(tail, "SETTINGS", []),
	};
}

export function readSql(file: string): string {
	return readFileSync(file, "utf8");
}
