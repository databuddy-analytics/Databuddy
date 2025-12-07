/**
 * Programmatic ClickHouse schema documentation generator.
 * Extracts schema information from actual table definitions to ensure docs are always up to date.
 */

/**
 * Schema table definition with description
 */
type TableDef = {
	name: string;
	description: string;
	keyColumns: string[];
	additionalInfo?: string;
};

/**
 * Analytics tables - main event tracking and user behavior
 */
const ANALYTICS_TABLES: TableDef[] = [
	{
		name: "analytics.events",
		description: "Main events table with page views and user sessions",
		keyColumns: [
			"id (UUID)",
			"client_id (String) - Website/project identifier",
			"event_name (String) - Event type",
			"anonymous_id (String) - User identifier",
			"session_id (String) - Session identifier",
			"time (DateTime64) - Event timestamp",
			"timestamp (DateTime64) - Alternative timestamp",

			// Page info
			"path (String) - URL path",
			"url (String) - Full URL",
			"title (String) - Page title",
			"referrer (String) - Referrer URL",

			// User agent & device
			"user_agent (String)",
			"browser_name (String)",
			"browser_version (String)",
			"os_name (String)",
			"os_version (String)",
			"device_type (String) - mobile/desktop/tablet",
			"device_brand (String)",
			"device_model (String)",

			// Geography
			"ip (String)",
			"country (String) - ISO country code",
			"region (String) - State/province",
			"city (String)",

			// Session metrics
			"time_on_page (Float32) - Seconds spent on page",
			"scroll_depth (Float32) - Max scroll percentage (0-100)",
			"interaction_count (Int16) - Number of interactions",
			"page_count (UInt8) - Pages in session",

			// UTM parameters
			"utm_source (String)",
			"utm_medium (String)",
			"utm_campaign (String)",
			"utm_term (String)",
			"utm_content (String)",

			// Performance metrics
			"load_time (Int32) - Page load time in ms",
			"dom_ready_time (Int32) - DOM ready time in ms",
			"dom_interactive (Int32) - DOM interactive time in ms",
			"ttfb (Int32) - Time to first byte in ms",
			"connection_time (Int32) - Connection time in ms",
			"request_time (Int32) - Request time in ms",
			"render_time (Int32) - Render time in ms",
			"redirect_time (Int32) - Redirect time in ms",
			"domain_lookup_time (Int32) - DNS lookup time in ms",

			// Additional data
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
		name: "analytics.error_spans",
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
		name: "analytics.custom_event_spans",
		description:
			"Custom tracked events (e.g., button clicks, form submissions)",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64)",
			"path (String) - Page where event occurred",
			"event_name (String) - Custom event name",
			"properties (String) - JSON string with event properties",
		],
		additionalInfo: "Has bloom filter indexes on session_id and event_name",
	},
	{
		name: "analytics.custom_events_hourly",
		description: "Hourly aggregated custom event statistics",
		keyColumns: [
			"client_id (String)",
			"path (String)",
			"event_name (String)",
			"hour (DateTime)",
			"event_count (UInt64)",
			"unique_users (AggregateFunction) - Unique users who triggered event",
			"unique_sessions (AggregateFunction) - Unique sessions with event",
		],
		additionalInfo: "AggregatingMergeTree with 1 year TTL",
	},
	{
		name: "analytics.outgoing_links",
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

/**
 * Generates comprehensive schema documentation for LLM consumption
 */
export function generateSchemaDocumentation(): string {
	const analyticsDoc = ANALYTICS_TABLES.map((table) => {
		const columns = table.keyColumns.map((col) => `  - ${col}`).join("\n");
		const info = table.additionalInfo
			? `\n  Note: ${table.additionalInfo}`
			: "";
		return `\n### ${table.name}\n${table.description}\n${columns}${info}`;
	}).join("\n");

	return `<available-data>
You have access to comprehensive website analytics data for understanding user behavior and site performance.

## Analytics Database (analytics.*)
Primary tables for website traffic, user behavior, and performance:
${analyticsDoc}

## Query Guidelines
- Use client_id = {websiteId:String} to filter by website
- For time-based queries, use time or timestamp columns
- Aggregation tables (*_hourly) are pre-computed for performance
- Use toStartOfDay(), toStartOfHour() for time grouping
- Geographic data uses ISO country codes
- All timestamps are in UTC
- Use uniqMerge() for unique counts from AggregateFunction columns
- Properties columns contain JSON strings - use JSONExtract functions to parse

## Common Query Patterns
\`\`\`sql
-- Page views over time
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
LIMIT 10

-- Error rate trends (using aggregated table)
SELECT
  toStartOfDay(hour) as date,
  sum(error_count) as errors,
  uniqMerge(affected_users) as users_affected
FROM analytics.error_hourly
WHERE client_id = {websiteId:String}
  AND hour >= now() - INTERVAL 7 DAY
GROUP BY date
ORDER BY date

-- Web Vitals performance (using aggregated table)
SELECT
  metric_name,
  quantileMerge(0.75)(p75) as p75_value,
  quantileMerge(0.50)(p50) as p50_value
FROM analytics.web_vitals_hourly
WHERE client_id = {websiteId:String}
  AND hour >= now() - INTERVAL 7 DAY
GROUP BY metric_name
\`\`\`
</available-data>`;
}

/**
 * Export the generated schema docs for use in prompts
 */
export const CLICKHOUSE_SCHEMA_DOCS = generateSchemaDocumentation();
