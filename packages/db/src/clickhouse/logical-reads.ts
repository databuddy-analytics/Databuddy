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
const RELATION = new RegExp(`\\b(?:FROM|JOIN)\\s+(?:${TABLE})`, "gi");

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
	RELATION.lastIndex = 0;
	return { query, usesFinal: RELATION.test(masked) };
}
