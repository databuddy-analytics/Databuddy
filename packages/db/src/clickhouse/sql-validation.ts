const ALLOWED_TABLE_PREFIX = "analytics.";
const BLOCKED_KEYWORD_PATTERN =
	/\b(?:ALTER|ATTACH|BACKUP|CREATE|DELETE|DETACH|DROP|EXCHANGE|INSERT|KILL|MOVE|OPTIMIZE|RENAME|REPLACE|RESTORE|SET|TRUNCATE|UPDATE|USE)\b/i;
const SELECT_OR_WITH_PATTERN = /^\s*(?:SELECT|WITH)\b/i;
const CTE_PATTERN = /(?:\bWITH\b|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s+AS\s*\(/gi;
const RELATION_PATTERN =
	/\b(?:FROM|JOIN)\s+(`[^`]+`|"[^"]+"|[a-zA-Z_][a-zA-Z0-9_.]*)(\s*\()?/gi;
const TENANT_FILTER_PATTERN = /\bclient_id\s*=\s*\{websiteId\s*:\s*String\}/i;

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

function normalizeRelationName(raw: string): string {
	return raw.replace(/[`"]/g, "").toLowerCase();
}

function extractCteNames(sql: string): Set<string> {
	const ctes = new Set<string>();
	let match = CTE_PATTERN.exec(sql);

	while (match) {
		ctes.add((match.at(1) as string).toLowerCase());
		match = CTE_PATTERN.exec(sql);
	}

	return ctes;
}

function extractRelationReferences(sql: string): {
	name: string;
	isFunction: boolean;
	raw: string;
}[] {
	const refs: { name: string; isFunction: boolean; raw: string }[] = [];
	let match = RELATION_PATTERN.exec(sql);

	while (match) {
		const raw = match.at(1) as string;
		refs.push({
			name: normalizeRelationName(raw),
			isFunction: Boolean(match.at(2)),
			raw,
		});
		match = RELATION_PATTERN.exec(sql);
	}

	return refs;
}

export function validateAgentSQL(sql: string): {
	valid: boolean;
	reason: string | null;
} {
	const sanitized = maskCommentsAndStrings(sql);

	if (!SELECT_OR_WITH_PATTERN.test(sanitized)) {
		return {
			valid: false,
			reason: "Only SELECT/WITH queries are allowed.",
		};
	}

	if (sanitized.includes(";")) {
		return {
			valid: false,
			reason: "Multiple statements are not allowed.",
		};
	}

	if (BLOCKED_KEYWORD_PATTERN.test(sanitized)) {
		return {
			valid: false,
			reason: "Query contains a blocked SQL keyword.",
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
	}

	return { valid: true, reason: null };
}

export function requiresTenantFilter(sql: string): boolean {
	return TENANT_FILTER_PATTERN.test(maskCommentsAndStrings(sql));
}

export const AGENT_SQL_VALIDATION_ERROR =
	"Query failed security validation. Only SELECT/WITH against analytics.* tables are allowed. " +
	"Use parameterized queries with {paramName:Type} syntax and include WHERE client_id = {websiteId:String}.";
