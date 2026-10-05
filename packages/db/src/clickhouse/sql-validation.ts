import { maskCommentsAndStrings } from "./logical-reads";

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
		"accept",
		"status_code",
		"source",
		"verification",
	]),
};

export function agentTenantFilter(table: string, value: string): string {
	const column = AGENT_TENANT_COLUMN_BY_TABLE[table];
	if (!column) {
		throw new Error(`${table} is not an agent table.`);
	}
	return column === "owner_id"
		? `(owner_id = ${value} OR website_id = ${value})`
		: `${column} = ${value}`;
}

const FROM_KEYWORD_PATTERN = /\bFROM\b/gi;
const FROM_CLAUSE_TERMINATOR_PATTERN =
	/\b(?:PREWHERE|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|SETTINGS|WINDOW|UNION|INTERSECT|EXCEPT)\b/i;

function topLevelUntilTerminator(sql: string, start: number): string {
	let depth = 0;
	let out = "";
	for (let i = start; i < sql.length; i++) {
		const ch = sql[i];
		if (ch === "(") {
			depth++;
		} else if (ch === ")") {
			if (depth === 0) {
				break;
			}
			depth--;
		} else if (depth === 0) {
			if (FROM_CLAUSE_TERMINATOR_PATTERN.exec(sql.slice(i))?.index === 0) {
				break;
			}
			out += ch;
		}
	}
	return out;
}

export function hasCommaJoinInFrom(sql: string): boolean {
	const masked = maskCommentsAndStrings(sql);
	for (const match of masked.matchAll(FROM_KEYWORD_PATTERN)) {
		if (
			topLevelUntilTerminator(masked, match.index + match[0].length).includes(
				","
			)
		) {
			return true;
		}
	}
	return false;
}
