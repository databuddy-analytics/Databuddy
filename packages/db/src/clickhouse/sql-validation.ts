const ALLOWED_TABLE_PREFIX = "analytics.";
const WEBSITE_ID_PARAM = "{websiteId:String}";
const ORG_TENANT_COLUMN = "owner_id";
export const AGENT_TENANT_COLUMN_BY_TABLE: Readonly<Record<string, string>> = {
	"analytics.events": "client_id",
	"analytics.error_spans": "client_id",
	"analytics.web_vitals_spans": "client_id",
	"analytics.engagement_spans": "client_id",
	"analytics.outgoing_links": "client_id",
	"analytics.custom_events": "owner_id",
	"analytics.revenue": "owner_id",
	"analytics.blocked_traffic": "client_id",
	"analytics.ai_traffic_spans": "client_id",
};

export const AGENT_TABLE_COLUMNS: Readonly<
	Record<string, ReadonlySet<string>>
> = {
	"analytics.events": new Set([
		"client_id",
		"anonymous_id",
		"profile_id",
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
		"time_on_page",
		"scroll_depth",
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
	"analytics.engagement_spans": new Set([
		"client_id",
		"anonymous_id",
		"session_id",
		"timestamp",
		"path",
		"device_type",
		"browser_name",
		"country",
		"page_index",
		"exit_type",
		"time_on_page",
		"active_time",
		"time_to_first_interaction",
		"max_scroll_depth",
		"scroll_count",
		"click_count",
		"key_count",
		"interaction_count",
		"copy_count",
		"rage_click_count",
		"dead_click_count",
		"rage_click_target",
		"dead_click_target",
		"form_field_count",
		"form_submit_count",
		"last_form_field",
		"form_abandoned",
		"error_count",
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
		"href",
		"text",
	]),
	"analytics.custom_events": new Set([
		"owner_id",
		"website_id",
		"anonymous_id",
		"profile_id",
		"session_id",
		"timestamp",
		"event_name",
		"properties",
	]),
	"analytics.revenue": new Set([
		"owner_id",
		"website_id",
		"transaction_id",
		"amount",
		"currency",
		"provider",
		"type",
		"status",
		"customer_id",
		"anonymous_id",
		"profile_id",
		"created",
	]),
	"analytics.blocked_traffic": new Set([
		"client_id",
		"timestamp",
		"block_reason",
		"bot_name",
		"path",
	]),
	"analytics.ai_traffic_spans": new Set([
		"client_id",
		"timestamp",
		"agent_id",
		"agent_purpose",
		"bot_name",
		"bot_type",
		"format",
		"path",
		"host",
		"referrer",
		"user_agent",
		"accept",
		"status_code",
		"source",
		"verification",
	]),
};

function tenantColumns(table: string): string[] {
	const column = AGENT_TENANT_COLUMN_BY_TABLE[table];
	if (!column) {
		return [];
	}
	return column === ORG_TENANT_COLUMN ? [column, "website_id"] : [column];
}

function tenantPredicate(
	columns: readonly string[],
	value: string,
	prefix = ""
): string {
	const comparisons = columns.map((column) => `${prefix}${column} = ${value}`);
	return comparisons.length > 1
		? `(${comparisons.join(" OR ")})`
		: comparisons.join("");
}

export function agentTenantFilter(table: string, alias = ""): string {
	return tenantPredicate(
		tenantColumns(table),
		WEBSITE_ID_PARAM,
		alias ? `${alias}.` : ""
	);
}

function describeTenantFilters(): string {
	const tablesByFilter = new Map<string, string[]>();
	for (const table of Object.keys(AGENT_TENANT_COLUMN_BY_TABLE)) {
		const filter = agentTenantFilter(table);
		const tables = tablesByFilter.get(filter) ?? [];
		tables.push(table);
		tablesByFilter.set(filter, tables);
	}
	return [...tablesByFilter]
		.sort(([, a], [, b]) => b.length - a.length)
		.map(([filter, tables], index) =>
			index === 0 ? `\`${filter}\`` : `\`${filter}\` on ${tables.join(" and ")}`
		)
		.join(", or ");
}

export const AGENT_TENANT_FILTERS = describeTenantFilters();

export function buildAdditionalTableFilters(
	tables: Iterable<string>,
	websiteId: string
): string {
	const quotedWebsiteId = `''${websiteId.replaceAll("'", "''''")}''`;
	const entries: string[] = [];
	for (const table of tables) {
		const columns = tenantColumns(table);
		if (columns.length > 0) {
			entries.push(`'${table}':'${tenantPredicate(columns, quotedWebsiteId)}'`);
		}
	}
	return `{${entries.join(",")}}`;
}

const BLOCKED_KEYWORD_PATTERN =
	/\b(?:ALTER|ATTACH|BACKUP|CREATE|DELETE|DETACH|DROP|EXCEPT|EXCHANGE|FORMAT|GRANT|INSERT|INTERSECT|INTO|KILL|MOVE|OPTIMIZE|OUTFILE|RENAME|REPLACE|RESTORE|REVOKE|SETTINGS|TRUNCATE|UNION|UPDATE)\b/i;
const SELECT_OR_WITH_PATTERN = /^\s*(?:SELECT|WITH)\b/i;
const CTE_PATTERN = /(?:\bWITH\b|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
const RELATION_PATTERN =
	/\b(?:FROM|JOIN)\s+(`[^`]+`|"[^"]+"|[a-zA-Z_][a-zA-Z0-9_.]*)(\s*\()?(?:\s+(?:AS\s+)?(?!ON\b|JOIN\b|LEFT\b|RIGHT\b|FULL\b|INNER\b|OUTER\b|CROSS\b|ASOF\b|ANY\b|ALL\b|SEMI\b|ANTI\b|ARRAY\b|FINAL\b|USING\b|WHERE\b|PREWHERE\b|GROUP\b|ORDER\b|HAVING\b|LIMIT\b|OFFSET\b|SETTINGS\b|WINDOW\b)([a-zA-Z_][a-zA-Z0-9_]*))?/gi;
const TENANT_COMPARISON_PATTERN =
	/(?:\b([a-zA-Z_][a-zA-Z0-9_]*)\.)?\b(client_id|owner_id|website_id)\s*=\s*\{websiteId\s*:\s*String\}/gi;
const TENANT_GROUP_PATTERN =
	/\(\s*(?:\b([a-zA-Z_][a-zA-Z0-9_]*)\.)?\b(owner_id|website_id)\s*=\s*\{websiteId\s*:\s*String\}\s+OR\s+(?:\b([a-zA-Z_][a-zA-Z0-9_]*)\.)?\b(owner_id|website_id)\s*=\s*\{websiteId\s*:\s*String\}\s*\)/gi;
const SELECT_KEYWORD_PATTERN = /\bSELECT\b/gi;
const WITH_KEYWORD_PATTERN =
	/\bWITH\b(?!\s+(?:FILL|TOTALS|ROLLUP|CUBE|TIES)\b(?:\s*(?:\)|$)|\s+(?!AS\b)[a-z]))/gi;
const CTE_HEADER_PATTERN =
	/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s+AS\s*(?:,\s*[a-zA-Z_][a-zA-Z0-9_]*\s+AS\s*)*$/i;
const FROM_KEYWORD_PATTERN = /\bFROM\b/gi;
const WHERE_KEYWORD_PATTERN = /\bWHERE\b/gi;
const TOP_LEVEL_OR_PATTERN = /\bOR\b/i;
const CONJUNCT_START_PATTERN = /(?:^|\bAND)\s*$/i;
const CONJUNCT_END_PATTERN = /^\s*(?:AND\b|$)/i;
const CLAUSE_TERMINATOR_PATTERN =
	/\b(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|SETTINGS|WINDOW|JOIN)\b/i;
const FROM_CLAUSE_TERMINATOR_PATTERN =
	/\b(?:PREWHERE|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|SETTINGS|WINDOW|UNION|INTERSECT|EXCEPT)\b/i;
const PAGEVIEW_EVENT_PATTERN = /\bevent_name\s*=\s*(['"])pageview\1/i;
const SELECT_PROJECTION_PATTERN = /\bSELECT\b([\s\S]*?)\bFROM\b/gi;
const WILDCARD_PROJECTION_PATTERN =
	/(?:^|,)\s*(?:(?:DISTINCT|ALL)\s+)?(?:[a-zA-Z_][a-zA-Z0-9_]*\s*\.\s*)?\*\s*(?=,|$|\b(?:APPLY|EXCEPT|REPLACE)\b)/i;
const SENSITIVE_PROJECTION_PATTERN =
	/\b(?:ip|metadata|properties|url|user_agent)\b/i;
const COLUMNS_MATCHER_PATTERN = /\bCOLUMNS\s*\(/i;
const WHITESPACE_CHARACTER_PATTERN = /\s/;
const IDENTIFIER_CHARACTER_PATTERN = /[A-Za-z0-9_]/;
const ALIAS_FREE_CLAUSE_PATTERN =
	/\b(?:PREWHERE|WHERE|GROUP\s+BY|HAVING|ORDER\s+BY|QUALIFY|ON)\b/gi;
const ALIAS_KEYWORD_PATTERN = /\bAS\b/gi;
const CAST_CALL_PATTERN = /\bCAST\s*$/i;

const PLAIN_QUOTED_IDENTIFIER_PATTERN = /^[A-Za-z0-9_.]+$/;

function agentSqlSyntaxError(sql: string): string | null {
	let index = 0;
	while (index < sql.length) {
		const char = sql[index];
		const next = sql[index + 1];
		if (char === "'") {
			index += 1;
			let closed = false;
			while (index < sql.length) {
				if (sql[index] === "\\") {
					index += 2;
					continue;
				}
				if (sql[index] === "'") {
					if (sql[index + 1] === "'") {
						index += 2;
						continue;
					}
					index += 1;
					closed = true;
					break;
				}
				index += 1;
			}
			if (!closed) {
				return "Unterminated string literal.";
			}
			continue;
		}
		if (char === "`" || char === '"') {
			const end = sql.indexOf(char, index + 1);
			if (
				end < 0 ||
				!PLAIN_QUOTED_IDENTIFIER_PATTERN.test(sql.slice(index + 1, end))
			) {
				return "Quoted identifiers may contain only letters, digits, underscores and dots.";
			}
			index = end + 1;
			continue;
		}
		if (
			char === "#" ||
			(char === "-" && next === "-") ||
			(char === "/" && next === "*")
		) {
			return "Comments are not allowed; remove them and resend the query.";
		}
		if (char === "$" || char === "\\") {
			return `The character ${char} is not allowed outside string literals.`;
		}
		index += 1;
	}
	return null;
}

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

function findClauseEnd(
	sql: string,
	start: number,
	terminator = CLAUSE_TERMINATOR_PATTERN
): number {
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
			const m = sql.slice(i).match(terminator);
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

function enclosingParenAt(sql: string, position: number): number {
	const open: number[] = [];
	for (let i = 0; i < position; i++) {
		const ch = sql[i];
		if (ch === "(") {
			open.push(i);
		} else if (ch === ")") {
			open.pop();
		}
	}
	return open.at(-1) ?? -1;
}

function extractRelationReferences(sql: string): {
	name: string;
	alias: string;
	isFunction: boolean;
	raw: string;
	index: number;
}[] {
	const refs: {
		name: string;
		alias: string;
		isFunction: boolean;
		raw: string;
		index: number;
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
			index: match.index,
		});
		match = RELATION_PATTERN.exec(sql);
	}
	return refs;
}

function openParensAt(sql: string, position: number): number[] {
	const open: number[] = [];
	for (let i = 0; i < position; i++) {
		if (sql[i] === "(") {
			open.push(i);
		} else if (sql[i] === ")") {
			open.pop();
		}
	}
	return open;
}

function hiddenProjectionError(sql: string): string | null {
	if (COLUMNS_MATCHER_PATTERN.test(sql)) {
		return "COLUMNS() matchers are not allowed; select explicit columns.";
	}
	for (
		let star = sql.indexOf("*");
		star >= 0;
		star = sql.indexOf("*", star + 1)
	) {
		let end = star + 1;
		while (WHITESPACE_CHARACTER_PATTERN.test(sql[end] ?? "")) {
			end += 1;
		}
		if (sql[end] !== "," && sql[end] !== ")") {
			continue;
		}
		let start = star - 1;
		while (WHITESPACE_CHARACTER_PATTERN.test(sql[start] ?? "")) {
			start -= 1;
		}
		const qualified = sql[start] === ".";
		if (!qualified && sql[start] !== "(") {
			continue;
		}
		start -= 1;
		while (WHITESPACE_CHARACTER_PATTERN.test(sql[start] ?? "")) {
			start -= 1;
		}
		const functionEnd = start + 1;
		while (IDENTIFIER_CHARACTER_PATTERN.test(sql[start] ?? "")) {
			start -= 1;
		}
		if (
			qualified ||
			sql.slice(start + 1, functionEnd).toLowerCase() !== "count"
		) {
			return "Wildcard arguments are not allowed; pass explicit columns.";
		}
	}
	for (const clause of sql.matchAll(ALIAS_FREE_CLAUSE_PATTERN)) {
		const start = clause.index + clause[0].length;
		const body = sql.slice(start, findClauseEnd(sql, start));
		for (const alias of body.matchAll(ALIAS_KEYWORD_PATTERN)) {
			const insideCast = openParensAt(body, alias.index).some((open) =>
				CAST_CALL_PATTERN.test(body.slice(0, open))
			);
			if (!insideCast) {
				return "Aliases are allowed only in SELECT lists, table references and CTE names.";
			}
		}
	}
	return null;
}

function validateSelectProjections(sql: string): string | null {
	const hidden = hiddenProjectionError(sql);
	if (hidden) {
		return hidden;
	}
	for (const match of sql.matchAll(SELECT_PROJECTION_PATTERN)) {
		const projection = match[1] ?? "";
		if (WILDCARD_PROJECTION_PATTERN.test(projection)) {
			return "Wildcard projections are not allowed; select explicit columns.";
		}
		const sensitive = projection.match(SENSITIVE_PROJECTION_PATTERN)?.[0];
		if (sensitive) {
			return `Column "${sensitive}" is sensitive and is not allowed in agent SQL projections.`;
		}
	}
	return null;
}

function whereClauses(sql: string): { body: string; scope: number }[] {
	const clauses: { body: string; scope: number }[] = [];
	WHERE_KEYWORD_PATTERN.lastIndex = 0;
	let m = WHERE_KEYWORD_PATTERN.exec(sql);
	while (m) {
		const start = m.index + m[0].length;
		const end = findClauseEnd(sql, start);
		clauses.push({
			body: sql.slice(start, end),
			scope: enclosingParenAt(sql, m.index),
		});
		WHERE_KEYWORD_PATTERN.lastIndex = end;
		m = WHERE_KEYWORD_PATTERN.exec(sql);
	}
	return clauses;
}

function hasCommaJoinInSanitizedFrom(sql: string): boolean {
	FROM_KEYWORD_PATTERN.lastIndex = 0;
	let m = FROM_KEYWORD_PATTERN.exec(sql);
	while (m) {
		const start = m.index + m[0].length;
		const end = findClauseEnd(sql, start, FROM_CLAUSE_TERMINATOR_PATTERN);
		const segment = flattenToTopLevel(sql.slice(start, end));
		if (segment.includes(",")) {
			return true;
		}
		FROM_KEYWORD_PATTERN.lastIndex = start;
		m = FROM_KEYWORD_PATTERN.exec(sql);
	}
	return false;
}

export function hasCommaJoinInFrom(sql: string): boolean {
	return hasCommaJoinInSanitizedFrom(maskCommentsAndStrings(sql));
}

function topLevelTenantFilters(whereBody: string): Map<string, Set<string>> {
	const filtersByAlias = new Map<string, Set<string>>();
	const flat = flattenToTopLevel(whereBody);
	const isConjunct = (match: RegExpExecArray) =>
		CONJUNCT_START_PATTERN.test(flat.slice(0, match.index)) &&
		CONJUNCT_END_PATTERN.test(flat.slice(match.index + match[0].length));
	const add = (alias: string | undefined, columns: string[]) => {
		const key = (alias ?? "").toLowerCase();
		const unique = [
			...new Set(columns.map((column) => column.toLowerCase())),
		].sort();
		const filters = filtersByAlias.get(key) ?? new Set<string>();
		filters.add(tenantPredicate(unique, WEBSITE_ID_PARAM));
		filtersByAlias.set(key, filters);
	};
	for (const match of flat.matchAll(TENANT_COMPARISON_PATTERN)) {
		if (isConjunct(match)) {
			add(match[1], [match[2] as string]);
		}
	}
	for (const match of whereBody.matchAll(TENANT_GROUP_PATTERN)) {
		const sameAlias =
			(match[1] ?? "").toLowerCase() === (match[3] ?? "").toLowerCase();
		if (
			sameAlias &&
			enclosingParenAt(whereBody, match.index) === -1 &&
			isConjunct(match)
		) {
			add(match[1], [match[2] as string, match[4] as string]);
		}
	}
	return filtersByAlias;
}

function hasTopLevelOr(whereBody: string): boolean {
	return TOP_LEVEL_OR_PATTERN.test(flattenToTopLevel(whereBody));
}
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

export function validateAgentSQL(
	sql: string
): { valid: true; reason: null } | { valid: false; reason: string } {
	const syntaxError = agentSqlSyntaxError(sql);
	if (syntaxError) {
		return { valid: false, reason: syntaxError };
	}
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
	// Scalar WITH aliases can hide protected columns from the SELECT guard.
	// Support CTEs only; safe scalar expressions can stay in SELECT.
	for (const match of sanitized.matchAll(WITH_KEYWORD_PATTERN)) {
		const remaining = sanitized.slice(match.index + match[0].length);
		const flat = flattenToTopLevel(remaining);
		const select = flat.search(SELECT_KEYWORD_PATTERN);
		const header = flat.slice(0, select);
		if (
			select < 0 ||
			!CTE_HEADER_PATTERN.test(header) ||
			extractCteNames(`WITH ${remaining.slice(0, select)}`).size === 0
		) {
			return {
				valid: false,
				reason:
					"WITH supports CTEs only (name AS (SELECT ...)); put scalar expressions in SELECT.",
			};
		}
	}
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
		const [, aliasRaw, colRaw] = qm;
		qm = QUALIFIED_COLUMN.exec(sanitized);
		if (!(aliasRaw && colRaw)) {
			continue;
		}
		const table = aliasToTable.get(aliasRaw.toLowerCase());
		if (table) {
			const validCols = AGENT_TABLE_COLUMNS[table];
			if (validCols && !validCols.has(colRaw.toLowerCase())) {
				return {
					valid: false,
					reason: `Column "${colRaw}" does not exist on ${table}. Valid columns: ${[...validCols].join(", ")}.`,
				};
			}
		}
	}

	const selectCount = sanitized.match(SELECT_KEYWORD_PATTERN)?.length ?? 0;
	if (selectCount > 1 + cteNames.size) {
		return {
			valid: false,
			reason: "Subqueries are not allowed; use a CTE instead.",
		};
	}

	if (hasCommaJoinInSanitizedFrom(sanitized)) {
		return {
			valid: false,
			reason:
				"Comma-separated joins are not allowed; use explicit JOIN syntax.",
		};
	}

	const clauses = whereClauses(sanitized);
	for (const clause of clauses) {
		if (hasTopLevelOr(clause.body)) {
			return {
				valid: false,
				reason:
					"Top-level OR in WHERE is not allowed; wrap OR predicates inside parentheses so the tenant filter remains AND-ed.",
			};
		}
	}

	const tableRefs = refs
		.filter((ref) => !cteNames.has(ref.name))
		.map((ref) => ({ ...ref, scope: enclosingParenAt(sanitized, ref.index) }));
	for (const ref of tableRefs) {
		const required = agentTenantFilter(ref.name);
		const clause = clauses.find((candidate) => candidate.scope === ref.scope);
		if (!clause) {
			return {
				valid: false,
				reason: `Table ${ref.raw} needs a WHERE clause that ANDs \`${required}\` at the top level.`,
			};
		}
		const filters = topLevelTenantFilters(clause.body);
		const needsAlias = tableRefs.some(
			(other) => other.scope === ref.scope && other.alias !== ref.alias
		);
		if (
			filters.get(ref.alias)?.has(required) ||
			(!needsAlias && filters.get("")?.has(required))
		) {
			continue;
		}
		return {
			valid: false,
			reason: needsAlias
				? `Multi-table query: alias "${ref.alias}" needs its own tenant filter \`${agentTenantFilter(ref.name, ref.alias)}\` AND-ed at the top level.`
				: `Table ${ref.raw} requires tenant filter \`${required}\` AND-ed at the top level.`,
		};
	}

	const projectionError = validateSelectProjections(sanitized);
	if (projectionError) {
		return { valid: false, reason: projectionError };
	}

	return { valid: true, reason: null };
}
