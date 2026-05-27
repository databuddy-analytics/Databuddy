const ALLOWED_TABLE_PREFIX = "analytics.";

/**
 * Tenant column for each analytics.* table the agent is allowed to query.
 * Used both as an allowlist (any analytics.X table not listed here is rejected)
 * and to build per-table `additional_table_filters` for server-side tenant
 * isolation. Add new tables here when they ship — but prefer query builders
 * for tables with complex tenant logic (custom_events, revenue).
 */
export const AGENT_TENANT_COLUMN_BY_TABLE: Readonly<Record<string, string>> = {
	"analytics.events": "client_id",
	"analytics.error_spans": "client_id",
	"analytics.web_vitals_spans": "client_id",
	"analytics.outgoing_links": "client_id",
	"analytics.custom_events": "owner_id",
	"analytics.revenue": "owner_id",
	"analytics.blocked_traffic": "client_id",
	"analytics.link_visits": "client_id",
};

export const AGENT_TABLE_COLUMNS: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	"analytics.events": new Set([
		"client_id",
		"anonymous_id",
		"session_id",
		"time",
		"path",
		"referrer",
		"browser_name",
		"os_name",
		"device_type",
		"country",
		"region",
		"city",
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"load_time",
		"time_on_page",
		"scroll_depth",
		"properties",
		"event_name",
	]),
	"analytics.error_spans": new Set([
		"client_id",
		"anonymous_id",
		"session_id",
		"timestamp",
		"path",
		"message",
		"filename",
		"lineno",
		"colno",
		"stack",
		"error_type",
	]),
	"analytics.web_vitals_spans": new Set([
		"client_id",
		"anonymous_id",
		"session_id",
		"timestamp",
		"path",
		"metric_name",
		"metric_value",
	]),
	"analytics.outgoing_links": new Set([
		"client_id",
		"anonymous_id",
		"session_id",
		"timestamp",
		"path",
		"href",
		"text",
	]),
	"analytics.custom_events": new Set([
		"owner_id",
		"anonymous_id",
		"session_id",
		"timestamp",
		"event_name",
		"properties",
	]),
	"analytics.revenue": new Set([
		"owner_id",
		"transaction_id",
		"amount",
		"currency",
		"provider",
		"type",
		"customer_id",
		"created",
	]),
	"analytics.blocked_traffic": new Set([
		"client_id",
		"timestamp",
		"block_reason",
		"bot_name",
		"path",
	]),
	"analytics.link_visits": new Set([
		"client_id",
		"timestamp",
		"link_id",
		"referrer",
		"country",
		"device_type",
		"browser_name",
	]),
};

/**
 * Builds the `additional_table_filters` ClickHouse session-setting value
 * scoped to `websiteId` for the supplied tables. The returned string is the
 * raw map literal (no JSON quoting); pass it as the value of the
 * `additional_table_filters` entry in `clickhouse_settings`.
 *
 * Format: `{'<table>':'<col>=''<id>''',...}` where double single-quotes
 * are the ClickHouse SQL escape for a single quote.
 */
export function buildAdditionalTableFilters(
	tables: Iterable<string>,
	websiteId: string
): string {
	const escapedForMapValue = websiteId.replaceAll("'", "''''");
	const entries: string[] = [];
	for (const table of tables) {
		const column = AGENT_TENANT_COLUMN_BY_TABLE[table];
		if (!column) {
			continue;
		}
		entries.push(`'${table}':'${column}=''${escapedForMapValue}'''`);
	}
	return `{${entries.join(",")}}`;
}

const BLOCKED_KEYWORD_PATTERN =
	/\b(?:ALTER|ATTACH|BACKUP|CREATE|DELETE|DETACH|DROP|EXCEPT|EXCHANGE|FORMAT|GRANT|INSERT|INTERSECT|INTO|KILL|MOVE|OPTIMIZE|OUTFILE|RENAME|REPLACE|RESTORE|REVOKE|SETTINGS|TRUNCATE|UNION|UPDATE)\b/i;
const SELECT_OR_WITH_PATTERN = /^\s*(?:SELECT|WITH)\b/i;
const CTE_PATTERN = /(?:\bWITH\b|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
const RELATION_PATTERN =
	/\b(?:FROM|JOIN)\s+(`[^`]+`|"[^"]+"|[a-zA-Z_][a-zA-Z0-9_.]*)(\s*\()?(?:\s+(?:AS\s+)?(?!ON\b|JOIN\b|LEFT\b|RIGHT\b|FULL\b|INNER\b|OUTER\b|CROSS\b|ASOF\b|ANY\b|ALL\b|SEMI\b|ANTI\b|ARRAY\b|FINAL\b|USING\b|WHERE\b|PREWHERE\b|GROUP\b|ORDER\b|HAVING\b|LIMIT\b|OFFSET\b|SETTINGS\b|WINDOW\b)([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
const TENANT_FILTER_PATTERN =
	/\b(?:client_id|owner_id)\s*=\s*\{websiteId\s*:\s*String\}/i;
const ALIASED_TENANT_FILTER_PATTERN =
	/(?:\b([a-zA-Z_][a-zA-Z0-9_]*)\.)?\b(?:client_id|owner_id)\s*=\s*\{websiteId\s*:\s*String\}/gi;
const SELECT_KEYWORD_PATTERN = /\bSELECT\b/gi;
const FROM_KEYWORD_PATTERN = /\bFROM\b/gi;
const WHERE_KEYWORD_PATTERN = /\bWHERE\b/gi;
const TOP_LEVEL_OR_PATTERN = /\bOR\b/i;
const CLAUSE_TERMINATOR_PATTERN =
	/\b(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|SETTINGS|WINDOW|JOIN)\b/i;
const PAGEVIEW_EVENT_PATTERN = /\bevent_name\s*=\s*(['"])pageview\1/i;

function maskCommentsAndStrings(sql: string): string {
	let result = "";
	let index = 0;

	while (index < sql.length) {
		const char = sql[index];
		const next = sql[index + 1];

		if (char === "-" && next === "-") {
			result += "  ";
			index += 2;
			while (index < sql.length && sql[index] !== "\n") {
				result += " ";
				index += 1;
			}
			continue;
		}

		if (char === "/" && next === "*") {
			result += "  ";
			index += 2;
			while (index < sql.length) {
				if (sql[index] === "*" && sql[index + 1] === "/") {
					result += "  ";
					index += 2;
					break;
				}
				result += sql[index] === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}

		if (char === "'") {
			result += " ";
			index += 1;
			while (index < sql.length) {
				if (sql[index] === "\\") {
					result += "  ";
					index += 2;
					continue;
				}
				const current = sql[index];
				result += current === "\n" ? "\n" : " ";
				index += 1;
				if (current === "'") {
					break;
				}
			}
			continue;
		}

		result += char;
		index += 1;
	}

	return result;
}

function flattenToTopLevel(s: string): string {
	let depth = 0;
	let out = "";
	for (const ch of s) {
		if (ch === "(") {
			depth++;
			out += " ";
		} else if (ch === ")") {
			depth--;
			out += " ";
		} else {
			out += depth === 0 ? ch : " ";
		}
	}
	return out;
}

function findClauseEnd(sql: string, start: number): number {
	let depth = 0;
	for (let i = start; i < sql.length; i++) {
		const ch = sql[i];
		if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			if (depth === 0) {
				return i;
			}
			depth--;
		} else if (depth === 0) {
			const m = sql.slice(i).match(CLAUSE_TERMINATOR_PATTERN);
			if (m && m.index === 0) {
				return i;
			}
		}
	}
	return sql.length;
}

function extractCteNames(sql: string): Set<string> {
	const ctes = new Set<string>();
	CTE_PATTERN.lastIndex = 0;
	let match = CTE_PATTERN.exec(sql);
	while (match) {
		ctes.add((match[1] as string).toLowerCase());
		match = CTE_PATTERN.exec(sql);
	}
	return ctes;
}

function parenDepthAt(sql: string, position: number): number {
	let depth = 0;
	for (let i = 0; i < position; i++) {
		const ch = sql[i];
		if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			depth--;
		}
	}
	return depth;
}

function extractRelationReferences(sql: string): {
	name: string;
	alias: string;
	isFunction: boolean;
	raw: string;
	depth: number;
}[] {
	const refs: {
		name: string;
		alias: string;
		isFunction: boolean;
		raw: string;
		depth: number;
	}[] = [];
	RELATION_PATTERN.lastIndex = 0;
	let match = RELATION_PATTERN.exec(sql);
	while (match) {
		const raw = match[1] as string;
		const name = raw.replace(/[`"]/g, "").toLowerCase();
		const explicitAlias = match[3]?.toLowerCase();
		const impliedAlias = name.includes(".")
			? (name.split(".").at(-1) as string)
			: name;
		refs.push({
			name,
			alias: explicitAlias ?? impliedAlias,
			isFunction: Boolean(match[2]),
			raw,
			depth: parenDepthAt(sql, match.index),
		});
		match = RELATION_PATTERN.exec(sql);
	}
	return refs;
}

function whereClauseBodies(sql: string): string[] {
	const bodies: string[] = [];
	WHERE_KEYWORD_PATTERN.lastIndex = 0;
	let m = WHERE_KEYWORD_PATTERN.exec(sql);
	while (m) {
		const start = m.index + m[0].length;
		const end = findClauseEnd(sql, start);
		bodies.push(sql.slice(start, end));
		WHERE_KEYWORD_PATTERN.lastIndex = end;
		m = WHERE_KEYWORD_PATTERN.exec(sql);
	}
	return bodies;
}

function hasCommaJoinInFrom(sql: string): boolean {
	FROM_KEYWORD_PATTERN.lastIndex = 0;
	let m = FROM_KEYWORD_PATTERN.exec(sql);
	while (m) {
		const start = m.index + m[0].length;
		const end = findClauseEnd(sql, start);
		const segment = flattenToTopLevel(sql.slice(start, end));
		if (segment.includes(",")) {
			return true;
		}
		FROM_KEYWORD_PATTERN.lastIndex = end;
		m = FROM_KEYWORD_PATTERN.exec(sql);
	}
	return false;
}

function topLevelHasTenantFilter(whereBody: string): boolean {
	return TENANT_FILTER_PATTERN.test(flattenToTopLevel(whereBody));
}

function topLevelTenantFilterAliases(whereBody: string): Set<string> {
	const flat = flattenToTopLevel(whereBody);
	const aliases = new Set<string>();
	ALIASED_TENANT_FILTER_PATTERN.lastIndex = 0;
	let match = ALIASED_TENANT_FILTER_PATTERN.exec(flat);
	while (match) {
		aliases.add((match[1] ?? "").toLowerCase());
		match = ALIASED_TENANT_FILTER_PATTERN.exec(flat);
	}
	return aliases;
}

function hasTopLevelOr(whereBody: string): boolean {
	return TOP_LEVEL_OR_PATTERN.test(flattenToTopLevel(whereBody));
}

/**
 * Returns the set of allowlisted analytics.* tables referenced in the query.
 * Callers use this to build `additional_table_filters` server-side.
 * Pre-condition: sql has already passed `validateAgentSQL`.
 */
export function extractAllowlistedTables(sql: string): Set<string> {
	const sanitized = maskCommentsAndStrings(sql);
	const refs = extractRelationReferences(sanitized);
	const tables = new Set<string>();
	for (const ref of refs) {
		if (ref.name in AGENT_TENANT_COLUMN_BY_TABLE) {
			tables.add(ref.name);
		}
	}
	return tables;
}

export function validateAgentSQL(sql: string): {
	valid: boolean;
	reason: string | null;
} {
	const sanitized = maskCommentsAndStrings(sql);

	if (!SELECT_OR_WITH_PATTERN.test(sanitized)) {
		return { valid: false, reason: "Only SELECT/WITH queries are allowed." };
	}

	if (sanitized.includes(";")) {
		return { valid: false, reason: "Multiple statements are not allowed." };
	}

	if (BLOCKED_KEYWORD_PATTERN.test(sanitized)) {
		return {
			valid: false,
			reason:
				"Query contains a blocked SQL keyword (UNION/INTERSECT/EXCEPT/INTO/OUTFILE/FORMAT and DDL/DML are not allowed).",
		};
	}

	if (PAGEVIEW_EVENT_PATTERN.test(sql)) {
		return {
			valid: false,
			reason:
				"Invalid pageview event name: use event_name = 'screen_view', never 'pageview'.",
		};
	}

	const cteNames = extractCteNames(sanitized);
	const refs = extractRelationReferences(sanitized);

	if (refs.length === 0) {
		return {
			valid: false,
			reason: "Query must read from an allowed analytics table.",
		};
	}

	for (const ref of refs) {
		if (ref.isFunction) {
			return {
				valid: false,
				reason: `Table function "${ref.raw}" is not allowed.`,
			};
		}
		if (cteNames.has(ref.name)) {
			continue;
		}
		if (!ref.name.includes(".")) {
			return {
				valid: false,
				reason: `Table "${ref.raw}" must use an explicit database prefix.`,
			};
		}
		if (!ref.name.startsWith(ALLOWED_TABLE_PREFIX)) {
			return {
				valid: false,
				reason: `Table "${ref.raw}" is outside the allowed analytics database.`,
			};
		}
		if (!(ref.name in AGENT_TENANT_COLUMN_BY_TABLE)) {
			return {
				valid: false,
				reason: `Table "${ref.raw}" is not in the agent allowlist. Allowed analytics tables: ${Object.keys(AGENT_TENANT_COLUMN_BY_TABLE).join(", ")}.`,
			};
		}
	}

	const aliasToTable = new Map<string, string>();
	for (const ref of refs) {
		if (!cteNames.has(ref.name) && ref.name in AGENT_TABLE_COLUMNS) {
			aliasToTable.set(ref.alias, ref.name);
		}
	}

	const QUALIFIED_COLUMN =
		/\b([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
	QUALIFIED_COLUMN.lastIndex = 0;
	let qm = QUALIFIED_COLUMN.exec(sanitized);
	while (qm) {
		const alias = qm[1].toLowerCase();
		const col = qm[2].toLowerCase();
		const table = aliasToTable.get(alias);
		if (table) {
			const validCols = AGENT_TABLE_COLUMNS[table];
			if (validCols && !validCols.has(col)) {
				return {
					valid: false,
					reason: `Column "${qm[2]}" does not exist on ${table}. Valid columns: ${[...validCols].join(", ")}.`,
				};
			}
		}
		qm = QUALIFIED_COLUMN.exec(sanitized);
	}

	const selectCount = sanitized.match(SELECT_KEYWORD_PATTERN)?.length ?? 0;
	if (selectCount > 1 + cteNames.size) {
		return {
			valid: false,
			reason: "Subqueries are not allowed; use a CTE instead.",
		};
	}

	if (hasCommaJoinInFrom(sanitized)) {
		return {
			valid: false,
			reason:
				"Comma-separated joins are not allowed; use explicit JOIN syntax.",
		};
	}

	const whereBodies = whereClauseBodies(sanitized);
	if (whereBodies.length === 0) {
		return {
			valid: false,
			reason: "Query must include a WHERE clause with tenant isolation.",
		};
	}

	const outerNonCteRelationAliases = new Set(
		refs
			.filter((ref) => ref.depth === 0 && !cteNames.has(ref.name))
			.map((ref) => ref.alias.toLowerCase())
	);
	const requirePerAliasTenantFilter = outerNonCteRelationAliases.size > 1;

	for (const body of whereBodies) {
		if (!topLevelHasTenantFilter(body)) {
			return {
				valid: false,
				reason:
					"Every WHERE must include a tenant filter (`client_id = {websiteId:String}` or `owner_id = {websiteId:String}`) AND-ed at the top level.",
			};
		}
		if (hasTopLevelOr(body)) {
			return {
				valid: false,
				reason:
					"Top-level OR in WHERE is not allowed; wrap OR predicates inside parentheses so the tenant filter remains AND-ed.",
			};
		}
		if (requirePerAliasTenantFilter) {
			const filteredAliases = topLevelTenantFilterAliases(body);
			for (const alias of outerNonCteRelationAliases) {
				if (!filteredAliases.has(alias)) {
					return {
						valid: false,
						reason: `Multi-table query: each non-CTE table needs its own tenant filter \`${alias}.client_id = {websiteId:String}\` AND-ed at the top level. Missing for alias "${alias}".`,
					};
				}
			}
		}
	}

	return { valid: true, reason: null };
}

export const AGENT_SQL_VALIDATION_ERROR =
	"Query failed security validation. Only SELECT/WITH against analytics.* tables are allowed. " +
	"Use parameterized queries with {paramName:Type} syntax and include WHERE client_id = {websiteId:String} AND-ed at the top level of every SELECT.";
