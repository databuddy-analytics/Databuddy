import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
	validateAgentSQL,
} from "@databuddy/db/clickhouse";

export const SCHEMA_SECTIONS = [
	"events",
	"custom_events",
	"errors",
	"vitals",
	"outgoing",
	"revenue",
	"blocked_traffic",
] as const;
export type SchemaSection = (typeof SCHEMA_SECTIONS)[number];

interface TableDef {
	additionalInfo?: string;
	description: string;
	keyColumns: string[];
	name: string;
	section: SchemaSection;
}

const ANALYTICS_TABLES: TableDef[] = [
	{
		name: "analytics.events",
		section: "events",
		description: "Main events table with page views and user sessions",
		keyColumns: [
			"id (UUID)",
			"client_id (String) - Website/project identifier",
			"event_name (String) - Event type",
			"anonymous_id (String) - User identifier",
			"session_id (String) - Session identifier",
			"time (DateTime64) - Event timestamp",
			"timestamp (DateTime64) - Alternative timestamp",

			"path (String) - URL path",
			"url (String) - Full URL",
			"title (String) - Page title",
			"referrer (String) - Referrer URL",

			"user_agent (String)",
			"browser_name (String)",
			"browser_version (String)",
			"os_name (String)",
			"os_version (String)",
			"device_type (String) - mobile/desktop/tablet",
			"device_brand (String)",
			"device_model (String)",

			"ip (String)",
			"country (String) - ISO country code",
			"region (String) - State/province",
			"city (String)",

			"time_on_page (Float32) - Seconds spent on page",
			"scroll_depth (Float32) - Max scroll percentage (0-100)",
			"interaction_count (Int16) - Number of interactions",
			"page_count (UInt8) - Pages in session",

			"utm_source (String)",
			"utm_medium (String)",
			"utm_campaign (String)",
			"utm_term (String)",
			"utm_content (String)",

			"viewport_size (String) - e.g. 1200x800",
			"language (String) - Browser language",
			"timezone (String) - User timezone",
		],
		additionalInfo:
			"Partitioned by month (toYYYYMM(time)), ordered by (client_id, time, id)",
	},
	{
		name: "analytics.custom_events",
		section: "custom_events",
		description:
			"Custom events from SDK track() / /track API. Keyed by owner_id (org ID), NOT client_id — use get_data custom_events_* builders, not raw SQL.",
		keyColumns: [
			"owner_id (String) - Organization ID (not websiteId)",
			"website_id (Nullable String) - Optional website scope",
			"timestamp (DateTime64)",
			"event_name (LowCardinality String)",
			"namespace (LowCardinality Nullable String)",
			"path (Nullable String)",
			"properties (String) - JSON",
			"anonymous_id (Nullable String)",
			"session_id (Nullable String)",
			"source (LowCardinality Nullable String)",
		],
		additionalInfo:
			"Partitioned by day, ordered by (owner_id, event_name, timestamp).",
	},
	{
		name: "analytics.error_spans",
		section: "errors",
		description: "JavaScript errors and exceptions",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64)",
			"path (String) - Page where error occurred",
			"message (String) - Full error message text (filter on this to search by content; field name is 'message', NOT 'error_message')",
			"filename (String) - Source file",
			"lineno (Int32) - Line number",
			"colno (Int32) - Column number",
			"stack (String) - Stack trace (truncated to 1500 chars in recent_errors output)",
			"error_type (String) - JS error class name (Error, TypeError, ReferenceError, SyntaxError, etc.) — NOT the message. Filter by 'message' to match error text.",
		],
		additionalInfo:
			"Has bloom filter indexes on session_id, error_type, and message. Filterable fields on error queries: path, message, error_type (plus the global filters: country, region, city, device_type, browser_name, os_name).",
	},
	{
		name: "analytics.web_vitals_spans",
		section: "vitals",
		description: "Core Web Vitals measurements (FCP, LCP, CLS, INP, TTFB, FPS)",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64)",
			"path (String)",
			"metric_name (String) - One of: FCP, LCP, CLS, INP, TTFB, FPS",
			"metric_value (Float64) - Metric value",
		],
		additionalInfo: `Rating thresholds (computed at query time):
- LCP: good < 2500ms, poor > 4000ms
- FCP: good < 1800ms, poor > 3000ms
- CLS: good < 0.1, poor > 0.25
- INP: good < 200ms, poor > 500ms
- TTFB: good < 800ms, poor > 1800ms
- FPS: good > 55, poor < 30`,
	},
	{
		name: "analytics.outgoing_links",
		section: "outgoing",
		description: "External links clicked by users",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64)",
			"path (String) - Page the link was clicked from",
			"href (String) - Destination URL",
			"text (String) - Link text",
		],
	},
	{
		name: "analytics.revenue",
		section: "revenue",
		description:
			"Instrumented revenue transactions. Keyed by owner_id (org ID), NOT client_id — quantileTDigest needs toFloat64() on the Decimal amount column.",
		keyColumns: [
			"owner_id (String) - Organization ID (not websiteId)",
			"transaction_id (String)",
			"amount (Decimal64) - Transaction amount; cast to Float64 for percentiles",
			"currency (String)",
			"provider (LowCardinality String) - Payment provider",
			"type (LowCardinality String) - Transaction type",
			"customer_id (String)",
			"created (DateTime64) - Transaction timestamp",
		],
	},
	{
		name: "analytics.blocked_traffic",
		section: "blocked_traffic",
		description:
			"Requests rejected by the ingestion edge (bots, abuse, rate-limit). Useful for sizing junk traffic; never count as real visitors.",
		keyColumns: [
			"client_id (String)",
			"timestamp (DateTime64)",
			"block_reason (LowCardinality String) - Why the request was rejected",
			"bot_name (Nullable String) - Detected bot, if any",
			"path (Nullable String)",
		],
	},
];

const GUIDELINES = `## Query Guidelines
- Use client_id = {websiteId:String} to filter by website. Only websiteId is auto-injected as a parameter. For date ranges use now() - INTERVAL N DAY, not custom parameters like {from:DateTime}.
- The primary timestamp column on analytics.events is \`time\`. Avoid aliasing columns as \`time\` in CTEs/subqueries — it conflicts with ClickHouse's built-in time() function. Use \`ts\`, \`event_time\`, or \`event_ts\` as aliases instead.
- Use toStartOfDay(), toStartOfHour() for time grouping.
- Geographic data (country, region, city) exists only on analytics.events, NOT on web_vitals_spans or error_spans. Join via session_id if needed.
- All timestamps are in UTC.
- analytics.custom_events.properties contains JSON strings — use JSONExtractString(properties, 'key') to parse.

## Aggregate function preferences
- Percentiles: use \`quantileTDigest(p)(col)\` for p50/p75/p95/p99. Plain \`quantile(p)\` uses reservoir sampling and is noisy at the tails (~10% error at p99). \`quantileTDigest\` is within 0.1% of exact at the same memory cost.
- Distinct counts: \`uniq(col)\` (HLL11) is fine when approximate is OK. Prefer \`uniqCombined64(col)\` for high-cardinality distinct counts (visitor_id, session_id, anonymous_id, path) — same ~0.3% error as uniq() but lower memory and stable across reruns. Reserve \`uniqExact(col)\` only when an exact count is genuinely required (small cardinality dashboard widgets, billing).
- Top-N lists: prefer exact \`GROUP BY ... ORDER BY count() DESC LIMIT N\` for user-facing leaderboards. \`topK(N)(col)\` is approximate and can swap the bottom-of-list entries — only use it for ML/agent summarization where minor ordering noise is acceptable.

## ClickHouse Pitfalls
- NO nested aggregates: \`sum(count())\` is illegal. Use a subquery: \`SELECT sum(cnt) FROM (SELECT count() as cnt ... GROUP BY ...)\`
- NO aggregates in WHERE: use HAVING for post-aggregation filters, not WHERE.
- \`is_bounce\` is NOT a column. Compute bounces as sessions with exactly 1 pageview: \`SELECT session_id, count() as pv FROM analytics.events ... GROUP BY session_id HAVING pv = 1\`
- \`website_id\` is NOT the tenant column on \`analytics.events\`. Use \`client_id = {websiteId:String}\`.
- \`created_at\` is NOT the canonical event timestamp. Use \`time\` on \`analytics.events\`.
- \`page_path\` does NOT exist. The column is \`path\`.
- \`event_type\` does NOT exist. The column is \`event_name\`.
- Performance timing columns (\`load_time\`, \`ttfb\`, \`dom_ready_time\`, \`render_time\`) do NOT exist on analytics.events. Page performance lives in analytics.web_vitals_spans as metric_name/metric_value rows.
- \`properties\` on analytics.events is always empty. Custom event properties live in analytics.custom_events — use the custom_events_* builders.
- Pageviews are \`event_name = 'screen_view'\`. Never use \`event_name = 'pageview'\`.
- \`device_type\` is often empty. Always handle: \`NULLIF(device_type, '') as device_type\` or \`if(device_type = '', 'Desktop', device_type)\`
- For IN filters use tuple syntax: \`path IN ('/pricing', '/docs', '/demo')\`, NOT array syntax \`['/pricing', '/docs']\`
- formatDateTime does NOT support %A (weekday name). Use \`toDayOfWeek(time)\` (1=Mon, 7=Sun) or \`dateName('weekday', time)\`
- web_vitals_spans has NO device_type, country, or referrer columns. Join to analytics.events via session_id to get those.`;

const EXAMPLES_BY_SECTION: Record<SchemaSection, string> = {
	events: `-- Page views over time
SELECT
  toStartOfDay(time) as date,
  count() as views,
  uniq(anonymous_id) as unique_visitors
FROM analytics.events
WHERE client_id = {websiteId:String}
  AND time >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date

-- Top pages by traffic
SELECT
  path,
  count() as views,
  uniq(anonymous_id) as unique_visitors,
  avg(time_on_page) as avg_time
FROM analytics.events
WHERE client_id = {websiteId:String}
  AND time >= now() - INTERVAL 7 DAY
GROUP BY path
ORDER BY views DESC
LIMIT 10`,
	custom_events: `-- analytics.custom_events uses owner_id (org ID), not client_id.
-- Raw SQL won't work — use get_data with custom_events_* builders:
--   custom_events, custom_events_discovery, custom_events_summary,
--   custom_events_trends, custom_events_recent, custom_events_by_path,
--   custom_events_property_top_values, custom_events_property_classification`,
	errors: `-- Error rate trends
SELECT
  toStartOfDay(timestamp) as date,
  count() as errors,
  uniq(anonymous_id) as users_affected
FROM analytics.error_spans
WHERE client_id = {websiteId:String}
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date`,
	vitals: `-- Web Vitals performance
SELECT
  metric_name,
  quantileTDigest(0.75)(metric_value) as p75_value,
  quantileTDigest(0.50)(metric_value) as p50_value
FROM analytics.web_vitals_spans
WHERE client_id = {websiteId:String}
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY metric_name`,
	outgoing: `-- Top outgoing domains
SELECT
  domain(href) as dest,
  count() as clicks,
  uniq(anonymous_id) as users
FROM analytics.outgoing_links
WHERE client_id = {websiteId:String}
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY dest
ORDER BY clicks DESC
LIMIT 10`,
	revenue: `-- analytics.revenue is org-scoped (tenant=owner_id). Raw SQL via execute_sql_query
-- is not the right path for revenue questions — use get_data with revenue_* builders
-- (revenue_overview, revenue_by_provider, revenue_by_country, etc.). They handle the
-- org-binding correctly. For SQL: quantileTDigest on the Decimal amount column needs
-- toFloat64() casting.`,
	blocked_traffic: `-- Junk-traffic sizing
SELECT
  block_reason,
  bot_name,
  count() as blocked
FROM analytics.blocked_traffic
WHERE client_id = {websiteId:String}
  AND timestamp >= now() - INTERVAL 7 DAY
GROUP BY block_reason, bot_name
ORDER BY blocked DESC`,
};

const STATEMENT_SEPARATOR = /\n\s*\n/;
const STATEMENT_START = /^\s*(?:SELECT|WITH)\b/i;

function extractStatements(example: string): string[] {
	return example
		.split(STATEMENT_SEPARATOR)
		.map((chunk) => chunk.trim())
		.filter((chunk) => STATEMENT_START.test(chunk));
}
for (const [section, example] of Object.entries(EXAMPLES_BY_SECTION)) {
	for (const statement of extractStatements(example)) {
		const result = validateAgentSQL(statement);
		if (!result.valid) {
			throw new Error(
				`Example SQL for section "${section}" fails the agent validator: ${result.reason}\nStatement: ${statement.slice(0, 200)}`
			);
		}
	}
}

const DOCUMENTED_TABLES = new Set(ANALYTICS_TABLES.map((t) => t.name));
for (const table of Object.keys(AGENT_TENANT_COLUMN_BY_TABLE)) {
	if (!DOCUMENTED_TABLES.has(table)) {
		throw new Error(
			`Table "${table}" is in the agent SQL allowlist but missing from ANALYTICS_TABLES — add a TableDef entry or drop it from AGENT_TENANT_COLUMN_BY_TABLE.`
		);
	}
}
for (const table of ANALYTICS_TABLES) {
	const registryColumns = AGENT_TABLE_COLUMNS[table.name];
	if (!registryColumns) {
		continue;
	}
	for (const allowed of registryColumns) {
		const documented = table.keyColumns.some(
			(line) => line === allowed || line.startsWith(`${allowed} `)
		);
		if (!documented) {
			throw new Error(
				`Column "${allowed}" on ${table.name} is in AGENT_TABLE_COLUMNS but missing from the schema docs.`
			);
		}
	}
}

export interface SchemaDocOptions {
	includeExamples?: boolean;
	includeGuidelines?: boolean;
	sections?: readonly SchemaSection[];
}

export function generateSchemaDocumentation(
	opts: SchemaDocOptions = {}
): string {
	const { sections, includeGuidelines = true, includeExamples = true } = opts;
	const activeSections =
		sections && sections.length > 0
			? new Set<SchemaSection>(sections)
			: new Set<SchemaSection>(SCHEMA_SECTIONS);

	const tables = ANALYTICS_TABLES.filter((t) => activeSections.has(t.section));
	const analyticsDoc = tables
		.map((table) => {
			const columns = table.keyColumns.map((col) => `  - ${col}`).join("\n");
			const info = table.additionalInfo
				? `\n  Note: ${table.additionalInfo}`
				: "";
			return `\n### ${table.name}\n${table.description}\n${columns}${info}`;
		})
		.join("\n");

	const guidelinesBlock = includeGuidelines ? `\n\n${GUIDELINES}` : "";

	let examplesBlock = "";
	if (includeExamples) {
		const exampleText = [...activeSections]
			.map((s) => EXAMPLES_BY_SECTION[s])
			.filter(Boolean)
			.join("\n\n");
		if (exampleText) {
			examplesBlock = `\n\n## Common Query Patterns\n\`\`\`sql\n${exampleText}\n\`\`\``;
		}
	}

	return `<available-data>
You have access to comprehensive website analytics data for understanding user behavior and site performance.

## Analytics Database (analytics.*)
Primary tables for website traffic, user behavior, and performance:
${analyticsDoc}${guidelinesBlock}${examplesBlock}
</available-data>`;
}

export const CLICKHOUSE_SCHEMA_DOCS = generateSchemaDocumentation();
