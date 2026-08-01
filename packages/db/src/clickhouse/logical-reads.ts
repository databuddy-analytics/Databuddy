const TABLES = [
	"custom_events",
	"daily_pageviews",
	"error_spans",
	"events",
	"link_visits",
	"outgoing_links",
	"web_vitals_spans",
] as const;

const NAMES = TABLES.join("|");
const TABLE = [
	`analytics\\.(?:${NAMES})(?![a-zA-Z0-9_])`,
	`\`analytics\`\\s*\\.\\s*\`(?:${NAMES})\``,
	`"analytics"\\s*\\.\\s*"(?:${NAMES})"`,
	`\`analytics\\.(?:${NAMES})\``,
	`"analytics\\.(?:${NAMES})"`,
].join("|");
const RESERVED = [
	"ALL",
	"ANY",
	"ARRAY",
	"CROSS",
	"FINAL",
	"FORMAT",
	"FULL",
	"GLOBAL",
	"GROUP",
	"HAVING",
	"INNER",
	"JOIN",
	"LEFT",
	"LIMIT",
	"OFFSET",
	"ON",
	"ORDER",
	"OUTER",
	"PREWHERE",
	"RIGHT",
	"SAMPLE",
	"SETTINGS",
	"UNION",
	"USING",
	"WHERE",
	"WINDOW",
].join("|");
const RELATION = new RegExp(
	`\\b(FROM|JOIN)\\s+(${TABLE})(\\s+FINAL)?(?:\\s+AS\\s+([a-zA-Z_][a-zA-Z0-9_]*)|\\s+(?!(?:${RESERVED})\\b)([a-zA-Z_][a-zA-Z0-9_]*))?`,
	"gi"
);

function maskCommentsAndStrings(sql: string): string {
	let out = "";
	let index = 0;

	while (index < sql.length) {
		const char = sql[index];
		const next = sql[index + 1];
		if (char === "-" && next === "-") {
			out += "  ";
			index += 2;
			while (index < sql.length && sql[index] !== "\n") {
				out += " ";
				index += 1;
			}
			continue;
		}
		if (char === "/" && next === "*") {
			out += "  ";
			index += 2;
			while (index < sql.length) {
				if (sql[index] === "*" && sql[index + 1] === "/") {
					out += "  ";
					index += 2;
					break;
				}
				out += sql[index] === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}
		if (char === "'") {
			out += " ";
			index += 1;
			while (index < sql.length) {
				if (sql[index] === "\\" && index + 1 < sql.length) {
					out += "  ";
					index += 2;
					continue;
				}
				if (sql[index] === "'" && sql[index + 1] === "'") {
					out += "  ";
					index += 2;
					continue;
				}
				if (sql[index] === "'") {
					out += " ";
					index += 1;
					break;
				}
				out += sql[index] === "\n" ? "\n" : " ";
				index += 1;
			}
			continue;
		}
		out += char;
		index += 1;
	}

	return out;
}

export interface LogicalRead {
	query: string;
	usesFinal: boolean;
}

export function finalizeDeliveryTables(query: string): LogicalRead {
	const masked = maskCommentsAndStrings(query);
	const replacements: Array<{ end: number; start: number; value: string }> = [];
	let usesFinal = false;

	RELATION.lastIndex = 0;
	let match = RELATION.exec(masked);
	while (match) {
		const keyword = match[1];
		const table = match[2];
		const alias = match[4] ?? match[5];
		usesFinal = true;
		replacements.push({
			start: match.index,
			end: match.index + match[0].length,
			value: `${keyword} ${table} FINAL${alias ? ` AS ${alias}` : ""}`,
		});
		match = RELATION.exec(masked);
	}

	let rewritten = query;
	for (const replacement of replacements.reverse()) {
		rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`;
	}
	return { query: rewritten, usesFinal };
}
