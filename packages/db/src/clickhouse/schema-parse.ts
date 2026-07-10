import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface ParsedColumn {
	name: string;
	type: string;
	nullable: boolean;
	hasDefault: boolean;
	computed: boolean;
}

export function isNullable(type: string): boolean {
	const inner = type.replace(/^LowCardinality\((.*)\)$/i, "$1").trim();
	return /^Nullable\(/i.test(inner);
}

export interface ParsedTable {
	name: string;
	isView: boolean;
	columns: ParsedColumn[];
	engine: string;
	partitionBy: string;
	orderBy: string;
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

export function firstParenGroup(sql: string): { body: string; end: number } {
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

export function splitTopLevel(body: string): string[] {
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
	/\s+(?:DEFAULT|MATERIALIZED|ALIAS|EPHEMERAL|CODEC|TTL|COMMENT)\b/;
const NON_COLUMN = /^(?:INDEX|CONSTRAINT|PROJECTION|PRIMARY\s+KEY)\b/i;

export function tableNameOf(sql: string): string {
	const m = sql.match(
		/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.]*\.(\w+)/i
	);
	if (!m) {
		throw new Error("Could not parse table name");
	}
	return m[1];
}

export function qualifiedNameOf(sql: string): string {
	const m = sql.match(
		/CREATE\s+(?:TABLE|MATERIALIZED\s+VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\.(\w+)/i
	);
	if (!m) {
		throw new Error("Could not parse qualified table name");
	}
	return `${m[1]}.${m[2]}`;
}

export function parseColumns(sql: string): ParsedColumn[] {
	const cols: ParsedColumn[] = [];
	for (const item of splitTopLevel(firstParenGroup(sql).body)) {
		if (NON_COLUMN.test(item)) {
			continue;
		}
		const nameMatch = item.match(/^`?(\w+)`?\s+/);
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
			hasDefault: /\b(?:DEFAULT|EPHEMERAL)\b/i.test(afterName),
			computed: /\b(?:MATERIALIZED|ALIAS)\b/i.test(afterName),
		});
	}
	return cols;
}

function clause(tail: string, keyword: string, stops: string[]): string {
	const stopAlt = stops.join("|");
	const re = new RegExp(
		`${keyword}\\s+([\\s\\S]*?)\\s*(?=(?:${stopAlt})\\b|$)`,
		"i"
	);
	const m = tail.match(re);
	return m ? m[1].trim() : "";
}

export function parseTable(sql: string): ParsedTable {
	const name = tableNameOf(sql);
	const isView = /MATERIALIZED\s+VIEW/i.test(sql);
	const columns = parseColumns(sql);
	const tail = sql.slice(firstParenGroup(sql).end + 1).replace(/\s+/g, " ").trim();
	return {
		name,
		isView,
		columns,
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
