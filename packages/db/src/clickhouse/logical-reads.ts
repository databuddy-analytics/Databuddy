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

// Matches the FROM/JOIN + table-reference part, used to insert FINAL.
// The negative lookahead prevents adding FINAL when it is already present.
const FINALIZE_REGEX = new RegExp(
	`(\\b(?:FROM|JOIN)\\s+(?:${TABLE}))(?!\\s+FINAL\\b)`,
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

/**
 * Rewrites `query` so that every analytics delivery table reference carries an
 * explicit `FINAL` modifier in the SQL text, then returns the rewritten query
 * together with a `usesFinal` flag.
 *
 * Injecting `FINAL` into the SQL is more reliable than sending `final = 1` as
 * a ClickHouse session setting: the session-setting approach fails with error
 * code 164 ("Cannot modify 'final' setting in readonly mode") when the
 * connection user has readonly constraints, whereas a SQL-level `FINAL`
 * modifier is always accepted for SELECT queries.
 *
 * Position detection runs on a comment- and string-masked copy of the SQL so
 * that table names appearing inside string literals or comments are ignored.
 */
export function finalizeDeliveryTables(query: string): LogicalRead {
	const masked = maskCommentsAndStrings(query);
	RELATION.lastIndex = 0;
	if (!RELATION.test(masked)) {
		return { query, usesFinal: false };
	}

	// Collect insertion positions from the masked SQL (safe: comments/strings
	// are blanked out, so only real table references are matched).
	FINALIZE_REGEX.lastIndex = 0;
	const insertions: number[] = [];
	let match: RegExpExecArray | null;
	while ((match = FINALIZE_REGEX.exec(masked)) !== null) {
		// Insert " FINAL" right after the table-reference capture group.
		insertions.push(match.index + (match[1]?.length ?? match[0].length));
	}

	if (insertions.length === 0) {
		// All references already carry FINAL.
		return { query, usesFinal: true };
	}

	// Apply insertions right-to-left so earlier offsets remain valid.
	let rewritten = query;
	for (let i = insertions.length - 1; i >= 0; i--) {
		const pos = insertions[i] as number;
		rewritten = `${rewritten.slice(0, pos)} FINAL${rewritten.slice(pos)}`;
	}

	return { query: rewritten, usesFinal: true };
}
