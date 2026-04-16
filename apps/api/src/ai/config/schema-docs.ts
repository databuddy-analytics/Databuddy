export const SCHEMA_SECTIONS = [
	"events",
	"custom_events",
	"errors",
	"vitals",
	"outgoing",
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

			"load_time (Int32) - Page load time in ms",
			"dom_ready_time (Int32) - DOM ready time in ms",
			"dom_interactive (Int32) - DOM interactive time in ms",
			"ttfb (Int32) - Time to first byte in ms",
			"connection_time (Int32) - Connection time in ms",
			"request_time (Int32) - Request time in ms",
			"render_time (Int32) - Render time in ms",
			"redirect_time (Int32) - Redirect time in ms",
			"domain_lookup_time (Int32) - DNS lookup time in ms",

			"screen_resolution (String) - e.g. 1920x1080",
			"viewport_size (String) - e.g. 1200x800",
			"language (String) - Browser language",
			"timezone (String) - User timezone",
			"connection_type (String) - Network connection type",
			"rtt (Int16) - Round trip time",
			"downlink (Float32) - Download speed",
			"properties (String) - JSON string with custom properties",

			"created_at (DateTime64)",
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
			"message (String) - Error message",
			"filename (String) - Source file",
			"lineno (Int32) - Line number",
			"colno (Int32) - Column number",
			"stack (String) - Stack trace",
			"error_type (String) - Error type/name",
		],
		additionalInfo:
			"Has bloom filter indexes on session_id, error_type, and message",
	},
	{
		name: "analytics.error_hourly",
		section: "errors",
		description: "Hourly aggregated error statistics",
		keyColumns: [
			"client_id (String)",
			"path (String)",
			"error_type (String)",
			"message_hash (UInt64) - Hash of error message",
			"hour (DateTime) - Start of hour",
			"error_count (UInt64) - Total errors in hour",
			"affected_users (AggregateFunction) - Unique users affected",
			"affected_sessions (AggregateFunction) - Unique sessions affected",
			"sample_message (String) - Example error message",
		],
		additionalInfo: "AggregatingMergeTree with 1 year TTL",
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
		name: "analytics.web_vitals_hourly",
		section: "vitals",
		description: "Hourly aggregated Web Vitals statistics",
		keyColumns: [
			"client_id (String)",
			"path (String)",
			"metric_name (String)",
			"hour (DateTime)",
			"sample_count (UInt64)",
			"p75 (Float64) - 75th percentile",
			"p50 (Float64) - Median",
			"avg_value (Float64)",
			"min_value (Float64)",
			"max_value (Float64)",
		],
		additionalInfo: "SummingMergeTree with 1 year TTL",
	},
	{
		name: "analytics.outgoing_links",
		section: "outgoing",
		description: "External links clicked by users",
		keyColumns: [
			"id (UUID)",
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"href (String) - Link URL",
			"text (String) - Link text",
			"properties (String) - JSON string",
			"timestamp (DateTime64)",
		],
	},
];

const GUIDELINES = `## Query Guidelines
- Use client_id = {websiteId:String} to filter by website
- For time-based queries, use time or timestamp columns
- Aggregation tables (*_hourly) are pre-computed for performance
- Use toStartOfDay(), toStartOfHour() for time grouping
- Geographic data uses ISO country codes
- All timestamps are in UTC
- Use uniqMerge() for unique counts from AggregateFunction columns
- Properties columns contain JSON strings - use JSONExtract functions to parse`;

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
	errors: `-- Error rate trends (using aggregated table)
SELECT
  toStartOfDay(hour) as date,
  sum(error_count) as errors,
  uniqMerge(affected_users) as users_affected
FROM analytics.error_hourly
WHERE client_id = {websiteId:String}
  AND hour >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date`,
	vitals: `-- Web Vitals performance (using aggregated table)
SELECT
  metric_name,
  quantileMerge(0.75)(p75) as p75_value,
  quantileMerge(0.50)(p50) as p50_value
FROM analytics.web_vitals_hourly
WHERE client_id = {websiteId:String}
  AND hour >= now() - INTERVAL 7 DAY
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
};

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
