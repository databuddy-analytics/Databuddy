import {
	AGENT_TABLE_COLUMNS,
	AGENT_TENANT_COLUMN_BY_TABLE,
	CUSTOM_EVENTS_VISITOR_KEY,
	EVENTS_VISITOR_KEY,
} from "@databuddy/db/clickhouse";

export const SCHEMA_SECTIONS = [
	"events",
	"custom_events",
	"errors",
	"vitals",
	"engagement",
	"outgoing",
	"revenue",
	"blocked_traffic",
	"ai_traffic",
] as const;
type SchemaSection = (typeof SCHEMA_SECTIONS)[number];

interface TableDef {
	additionalInfo?: string;
	description: string;
	keyColumns: string[];
	name: string;
	section: SchemaSection;
}

export const ANALYTICS_TABLES: TableDef[] = [
	{
		name: "analytics.events",
		section: "events",
		description: "Main events table with page views and user sessions",
		keyColumns: [
			"id (UUID)",
			"client_id (String) - Website/project identifier",
			"event_name (String) - Event type",
			"anonymous_id (String) - Anonymous device identifier",
			"profile_id (String) - Identified user id from identify(), '' when anonymous",
			"session_id (String) - Session identifier",
			"time (DateTime64(3, 'UTC')) - Event timestamp",
			"timestamp (DateTime64(3)) - Alternative timestamp",

			"path (String) - URL path",
			"url (String) - Full URL",
			"title (Nullable(String))",
			"referrer (Nullable(String))",

			"browser_name (Nullable(String))",
			"browser_version (Nullable(String))",
			"os_name (Nullable(String))",
			"os_version (Nullable(String))",
			"device_type (Nullable(String)) - mobile/desktop/tablet",
			"device_brand (Nullable(String))",
			"device_model (Nullable(String))",

			"country (Nullable(String)) - ISO country code",
			"region (Nullable(String)) - State/province",
			"city (Nullable(String))",

			"time_on_page (Nullable(Float32)) - Seconds spent on page",
			"scroll_depth (Nullable(Float32)) - Max scroll percentage (0-100)",
			"interaction_count (Nullable(Int16)) - Number of interactions",
			"page_count (UInt8) - Page views so far in one page load; restarts on a full reload",

			"utm_source (Nullable(String))",
			"utm_medium (Nullable(String))",
			"utm_campaign (Nullable(String))",
			"utm_term (Nullable(String))",
			"utm_content (Nullable(String))",

			"viewport_size (Nullable(String)) - e.g. 1200x800",
			"language (Nullable(String)) - Browser language",
			"timezone (Nullable(String)) - User timezone",
		],
		additionalInfo: `Partitioned by month (toYYYYMM(time)), ordered by (client_id, time, id). Visitors on the dashboard are uniq(anonymous_id), one per device; people are uniq(${EVENTS_VISITOR_KEY}), which merges an identified user's devices.`,
	},
	{
		name: "analytics.custom_events",
		section: "custom_events",
		description: "Custom events from SDK track() and the /track API.",
		keyColumns: [
			"owner_id (LowCardinality(String)) - Organization id",
			"website_id (LowCardinality(Nullable(String))) - Website id; NULL for events sent without one",
			"timestamp (DateTime64(3, 'UTC'))",
			"event_name (LowCardinality(String))",
			"namespace (LowCardinality(Nullable(String)))",
			"path (Nullable(String))",
			"properties (String) - JSON object; the custom_events_property_* builders read its keys and values, SQL projections cannot",
			"anonymous_id (Nullable(String))",
			"profile_id (String) - Identified user id from identify(), '' when anonymous",
			"session_id (Nullable(String))",
			"source (LowCardinality(Nullable(String)))",
		],
		additionalInfo: `Partitioned by month, ordered by (owner_id, event_name, timestamp). People are uniq(${CUSTOM_EVENTS_VISITOR_KEY}), as in the custom_events builders, so rows with neither id never count as a person.`,
	},
	{
		name: "analytics.error_spans",
		section: "errors",
		description: "JavaScript errors and exceptions",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64(3, 'UTC'))",
			"path (String) - Page where error occurred",
			"message (String) - Full error message text (filter on this to search by content; field name is 'message', NOT 'error_message')",
			"filename (Nullable(String))",
			"lineno (Nullable(Int32))",
			"colno (Nullable(Int32))",
			"stack (Nullable(String)) - Stack trace (truncated to 1500 chars in recent_errors output)",
			"error_type (LowCardinality(String)) - JS error class name (Error, TypeError, ReferenceError, SyntaxError, etc.); not the message. Filter by 'message' to match error text.",
		],
		additionalInfo:
			"Error queries filter on path, message and error_type, and recent_errors also on country, region, device_type, browser_name and os_name.",
	},
	{
		name: "analytics.engagement_spans",
		section: "engagement",
		description:
			"One row per page view, written when the visitor leaves the page: attention, interaction, frustration, and form activity",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64(3, 'UTC')) - When the page view ended",
			"path (String)",
			"device_type (LowCardinality(String)) - mobile/desktop/tablet",
			"browser_name (LowCardinality(String))",
			"country (LowCardinality(String)) - ISO country code",
			"page_index (UInt16) - Position of the page view in the session",
			"exit_type (LowCardinality(String)) - spa (route change) or unload (tab closed or navigated away)",
			"time_on_page (UInt32) - Seconds on page",
			"active_time (UInt32) - Seconds the tab was visible and focused; use as the denominator for engagement rates",
			"time_to_first_interaction (UInt32) - Milliseconds until the first click, key, or scroll; 0 when none",
			"max_scroll_depth (UInt8) - 0-100",
			"scroll_count (UInt16)",
			"click_count (UInt16)",
			"key_count (UInt16)",
			"interaction_count (UInt16) - All pointer, key, and scroll events",
			"copy_count (UInt16) - Copy events on the page view",
			"rage_click_count (UInt16) - Bursts of three or more clicks on one element, each within a second of the last, that got no DOM change, navigation, or other response after the first click, counted once per burst; form fields, text selection, canvas, video, and the page background are excluded. Trackers before 2026-10-04 also counted fast clicks on working controls and form fields, and sites with pinned snippets or cached scripts run an older tracker for a while, so a date alone does not mark the cutover",
			"dead_click_count (UInt16) - Clicks on buttons, links, and other non-form controls that got no DOM change, navigation, or other response within 2.5 seconds. Trackers before 2026-10-02 also counted form fields and iOS link taps, inflating their rates. A site whose dead_click_target or rage_click_target values start with input, select, textarea, or label is still running an older tracker",
			"rage_click_target (String) - Descriptor of the last rage-clicked element, at most 64 characters: tag[:role]:label. The label is the data-track, aria-label, data-testid, name, or id, or for links the first path segment (a:/pricing, a:/blog/*) or the external site's domain (a:stripe.com). Unnamed elements end with their nearest landmark or developer-named container (button:unnamed in dialog:checkout)",
			"dead_click_target (LowCardinality(String)) - Descriptor of the last dead-clicked control, same format",
			"form_field_count (UInt16) - Distinct form fields focused on the page view",
			"form_submit_count (UInt16) - Form submits on the page view",
			"last_form_field (LowCardinality(String)) - Descriptor of the last focused field, e.g. input:email:work email",
			"form_abandoned (UInt8) - 1 when fields were touched and nothing was submitted",
			"error_count (UInt16) - Captured JavaScript errors during the page view",
		],
		additionalInfo:
			"Rates should divide by page views (COUNT(*)) or by active_time, never by session count. Targets are UI locations, not identifiers; group by them to find the control behind a frustration spike. Has a bloom filter index on session_id; no profile_id, resolve identified users via analytics.events anonymous_ids.",
	},
	{
		name: "analytics.web_vitals_spans",
		section: "vitals",
		description: "Core Web Vitals measurements (FCP, LCP, CLS, INP, TTFB, FPS)",
		keyColumns: [
			"client_id (String)",
			"anonymous_id (String)",
			"session_id (String)",
			"timestamp (DateTime64(3, 'UTC'))",
			"path (String)",
			"metric_name (LowCardinality(String)) - One of: FCP, LCP, CLS, INP, TTFB, FPS",
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
			"timestamp (DateTime64(3, 'UTC'))",
			"href (String) - Destination URL",
			"text (Nullable(String))",
		],
	},
	{
		name: "analytics.revenue",
		section: "revenue",
		description: "Revenue transactions from payment providers.",
		keyColumns: [
			"owner_id (String) - Organization id, or the website id on legacy rows",
			"website_id (Nullable(String)) - Website stored at ingestion",
			"transaction_id (String)",
			"amount (Decimal(18, 4)) - Transaction amount; cast to Float64 for percentiles",
			"currency (LowCardinality(String))",
			"provider (LowCardinality(String))",
			"type (LowCardinality(String)) - 'sale', 'subscription', 'refund', or 'subscription_event' (no money)",
			"status (LowCardinality(String)) - 'completed', 'failed', 'canceled', 'refunded', or 'linked'",
			"customer_id (String)",
			"anonymous_id (Nullable(String))",
			"profile_id (String) - Identified user id from identify(), '' when anonymous",
			"created (DateTime('UTC')) - Transaction timestamp",
		],
		additionalInfo:
			"Rows are replaced per (owner_id, transaction_id) by the newest synced_at; without FINAL a transaction can count twice. Collected money is type 'sale' or 'subscription' with status 'completed', and refunds are type 'refund' with status 'refunded'. The revenue_* builders also attribute websites through related payments and drop duplicate Stripe records, so their totals can differ.",
	},
	{
		name: "analytics.blocked_traffic",
		section: "blocked_traffic",
		description:
			"Requests rejected by the ingestion edge (bots, abuse, rate-limit). Useful for sizing junk traffic; never count as real visitors. AI crawlers and agents are not here; they are in analytics.ai_traffic_spans.",
		keyColumns: [
			"client_id (String)",
			"timestamp (DateTime64(3, 'UTC'))",
			"block_reason (LowCardinality(String)) - Why the request was rejected",
			"bot_name (Nullable(String)) - Detected bot, if any",
			"path (Nullable(String))",
		],
	},
	{
		name: "analytics.ai_traffic_spans",
		section: "ai_traffic",
		description:
			"One row per request from an AI crawler or agent (GPTBot, ClaudeBot, ChatGPT-User, Claude Code...), recorded server-side by @databuddy/sdk/agents (source = 'middleware') or a Vercel log drain (source = 'vercel'), or by the browser tracker (source = 'tracker'). These are bot reads, never visitors or pageviews. Prefer get_data ai_* builders (ai_crawlers, ai_agent_pages, ai_content_formats, ai_products): they name agents and products and skip duplicate rows.",
		additionalInfo:
			"Count AI requests with agent_id != ''; '' marks forwarded hits from bots that are not AI agents (search, SEO, monitoring). Server-side sources repeat requests the tracker also saw: when a site has both middleware and vercel rows, the source whose first row is newer counts from then on and the other only before it, and tracker rows count only before the first middleware or vercel row. Name agents by agent_id, not bot_name.",
		keyColumns: [
			"client_id (String)",
			"timestamp (DateTime64(3, 'UTC'))",
			"agent_id (LowCardinality(String)) - Registry id such as 'openai-crawler' (GPTBot), 'anthropic-crawler' (ClaudeBot) or 'claude-code'; 'unidentified:<token>' for unknown clients that asked for markdown first; '' when no AI agent was identified",
			"agent_purpose (LowCardinality(String)) - training | search_index | user_fetch (fetched live to answer a user) | agent (acting for a user)",
			"bot_name (String) - Detector bot name; rows written before the October 2026 detector fix can hold browser engines such as 'WebKit', so use agent_id instead",
			"bot_type (LowCardinality(String)) - ai_crawler | ai_assistant, or the detector category for other bots",
			"format (LowCardinality(String)) - markdown | llms (llms.txt, llms-full.txt) | html, as the agent asked for it; '' on tracker rows before 2026-09-27, which are html",
			"path (String) - Requested path, or full URL on tracker rows",
			"host (LowCardinality(String)) - Host the request was made to; '' on tracker rows",
			"referrer (Nullable(String)) - Referrer sent with the request; tracker rows written before the October 2026 tracker fix can hold the page's own URL",
			"user_agent (String)",
			"accept (String) - Request Accept header; '' when absent, on tracker rows and on vercel rows",
			"status_code (UInt16) - HTTP status returned to the agent (vercel rows only); 0 when unknown",
			"source (LowCardinality(String)) - middleware | vercel | tracker; tracker rows written before the October 2026 tracker fix also include rows from beacons and non-page-view events, not only page views",
			"verification (LowCardinality(String)) - 'host_unchecked' when stored during a website lookup outage, otherwise ''",
		],
	},
];

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
