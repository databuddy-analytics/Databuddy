import { clickHouse } from "./client";

const DATABASES = {
	ANALYTICS: "analytics",
	UPTIME: "uptime",
	OBSERVABILITY: "observability",
} as const;

const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.events (
  id UUID,
  client_id String,
  event_name String,
  anonymous_id String,
  time DateTime64(3, 'UTC'),
  session_id String,
  
  event_type LowCardinality(String) DEFAULT 'track',
  event_id Nullable(String),
  session_start_time Nullable(DateTime64(3, 'UTC')),
  timestamp DateTime64(3, 'UTC') DEFAULT time,
  
  referrer Nullable(String),
  url String,
  path String,
  title Nullable(String),
  
  ip String,
  user_agent String,
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  device_brand Nullable(String),
  device_model Nullable(String),
  country Nullable(String),
  region Nullable(String),
  city Nullable(String),
  
  screen_resolution Nullable(String),
  viewport_size Nullable(String),
  language Nullable(String),
  timezone Nullable(String),
  
  connection_type Nullable(String),
  rtt Nullable(Int16),
  downlink Nullable(Float32),
  
  time_on_page Nullable(Float32),
  scroll_depth Nullable(Float32),
  interaction_count Nullable(Int16),
  page_count UInt8 DEFAULT 1,
  
  utm_source Nullable(String),
  utm_medium Nullable(String),
  utm_campaign Nullable(String),
  utm_term Nullable(String),
  utm_content Nullable(String),
  
  load_time Nullable(Int32),
  dom_ready_time Nullable(Int32),
  dom_interactive Nullable(Int32),
  ttfb Nullable(Int32),
  connection_time Nullable(Int32),
  request_time Nullable(Int32),
  render_time Nullable(Int32),
  redirect_time Nullable(Int32),
  domain_lookup_time Nullable(Int32),
  
  properties String,
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (client_id, time, id)
SETTINGS index_granularity = 8192
`;

/**
 * Lean error spans table - minimal structure
 * No geo/UA enrichment, just the error data
 */
const CREATE_ERROR_SPANS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.error_spans (
  client_id String CODEC(ZSTD(1)),
  anonymous_id String CODEC(ZSTD(1)),
  session_id String CODEC(ZSTD(1)),
  
  timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
  path String CODEC(ZSTD(1)),
  
  message String CODEC(ZSTD(1)),
  filename Nullable(String) CODEC(ZSTD(1)),
  lineno Nullable(Int32) CODEC(ZSTD(1)),
  colno Nullable(Int32) CODEC(ZSTD(1)),
  stack Nullable(String) CODEC(ZSTD(1)),
  error_type LowCardinality(String) CODEC(ZSTD(1)),
  
  INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_error_type error_type TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_message message TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (client_id, error_type, path, timestamp)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
`;

/**
 * Hourly aggregated error stats
 */
const CREATE_ERROR_HOURLY_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.error_hourly (
  client_id String CODEC(ZSTD(1)),
  path String CODEC(ZSTD(1)),
  error_type LowCardinality(String) CODEC(ZSTD(1)),
  message_hash UInt64 CODEC(ZSTD(1)),
  hour DateTime CODEC(Delta(4), ZSTD(1)),
  
  error_count UInt64 CODEC(ZSTD(1)),
  affected_users AggregateFunction(uniq, String),
  affected_sessions AggregateFunction(uniq, String),
  sample_message String CODEC(ZSTD(1))
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (client_id, error_type, path, hour, message_hash)
TTL toDateTime(hour) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192
`;

/**
 * Materialized view for error hourly aggregation
 */
const CREATE_ERROR_HOURLY_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASES.ANALYTICS}.error_hourly_mv
TO ${DATABASES.ANALYTICS}.error_hourly
AS SELECT
  client_id,
  path,
  error_type,
  cityHash64(message) AS message_hash,
  toStartOfHour(timestamp) AS hour,
  count() AS error_count,
  uniqState(anonymous_id) AS affected_users,
  uniqState(session_id) AS affected_sessions,
  any(message) AS sample_message
FROM ${DATABASES.ANALYTICS}.error_spans
GROUP BY client_id, path, error_type, message_hash, hour
`;

/**
 * Optimized Web Vitals table - minimal spans-oriented design
 *
 * Rating computed at query time using standard thresholds:
 * - LCP: good < 2500, poor > 4000
 * - FCP: good < 1800, poor > 3000
 * - CLS: good < 0.1, poor > 0.25
 * - INP: good < 200, poor > 500
 * - TTFB: good < 800, poor > 1800
 * - FPS: good > 55, poor < 30
 */
const CREATE_WEB_VITALS_SPANS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.web_vitals_spans (
  client_id String CODEC(ZSTD(1)),
  anonymous_id String CODEC(ZSTD(1)),
  session_id String CODEC(ZSTD(1)),
  
  timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
  path String CODEC(ZSTD(1)),
  
  metric_name LowCardinality(String) CODEC(ZSTD(1)),
  metric_value Float64 CODEC(Gorilla, ZSTD(1)),
  
  INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_metric_value metric_value TYPE minmax GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (client_id, metric_name, path, timestamp)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
`;

/**
 * Hourly aggregated Web Vitals
 */
const CREATE_WEB_VITALS_HOURLY_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.web_vitals_hourly (
  client_id String CODEC(ZSTD(1)),
  path String CODEC(ZSTD(1)),
  metric_name LowCardinality(String) CODEC(ZSTD(1)),
  hour DateTime CODEC(Delta(4), ZSTD(1)),
  
  sample_count UInt64 CODEC(ZSTD(1)),
  p75 Float64 CODEC(ZSTD(1)),
  p50 Float64 CODEC(ZSTD(1)),
  avg_value Float64 CODEC(ZSTD(1)),
  min_value Float64 CODEC(ZSTD(1)),
  max_value Float64 CODEC(ZSTD(1))
) ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (client_id, metric_name, path, hour)
TTL toDateTime(hour) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192
`;

/**
 * Materialized view for Web Vitals hourly aggregation
 */
const CREATE_WEB_VITALS_HOURLY_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASES.ANALYTICS}.web_vitals_hourly_mv
TO ${DATABASES.ANALYTICS}.web_vitals_hourly
AS SELECT
  client_id,
  path,
  metric_name,
  toStartOfHour(timestamp) AS hour,
  count() AS sample_count,
  quantile(0.75)(metric_value) AS p75,
  quantile(0.50)(metric_value) AS p50,
  avg(metric_value) AS avg_value,
  min(metric_value) AS min_value,
  max(metric_value) AS max_value
FROM ${DATABASES.ANALYTICS}.web_vitals_spans
GROUP BY client_id, path, metric_name, hour
`;

const CREATE_LINK_VISITS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.link_visits (
  id UUID,
  link_id String,
  workspace_id String,
  visited_at DateTime64(3, 'UTC'),
  referer Nullable(String),
  user_agent Nullable(String),
  ip_hash String,
  country Nullable(String),
  region Nullable(String),
  city Nullable(String),
  browser_name Nullable(String),
  device_type Nullable(String),

  INDEX idx_link_id link_id TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(visited_at)
ORDER BY (workspace_id, link_id, visited_at)
SETTINGS index_granularity = 8192
`;

const CREATE_BLOCKED_TRAFFIC_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.blocked_traffic (
  id UUID,
  client_id String,
  timestamp DateTime64(3, 'UTC'),
  
  path Nullable(String),
  url Nullable(String),
  referrer Nullable(String),
  method LowCardinality(String) DEFAULT 'POST',
  origin Nullable(String),
  
  ip String,
  user_agent Nullable(String),
  accept_header Nullable(String),
  language Nullable(String),
  
  block_reason LowCardinality(String),
  block_category LowCardinality(String),
  bot_name Nullable(String),
  
  country Nullable(String),
  region Nullable(String),
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  
  payload_size Nullable(UInt32),
  
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (timestamp, client_id, id)
TTL toDateTime(timestamp) + INTERVAL 6 MONTH
SETTINGS index_granularity = 8192
`;

const CREATE_EMAIL_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.email_events (
    event_id UUID DEFAULT generateUUIDv4(),
    email_hash String,
    domain String,
    labels Array(LowCardinality(String)),
    event_time DateTime,
    received_at DateTime,
    ingestion_time DateTime DEFAULT now(),
    metadata_json JSON
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(event_time)
ORDER BY (domain, event_time)
SETTINGS index_granularity = 8192
`;

/**
 * Lean custom event spans table
 * Uses JSON for flexible metadata
 */
const CREATE_CUSTOM_EVENT_SPANS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.custom_event_spans (
  client_id String CODEC(ZSTD(1)),
  anonymous_id String CODEC(ZSTD(1)),
  session_id String CODEC(ZSTD(1)),
  
  timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
  path String CODEC(ZSTD(1)),
  
  event_name LowCardinality(String) CODEC(ZSTD(1)),
  properties String CODEC(ZSTD(1)),
  
  INDEX idx_session_id session_id TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_event_name event_name TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (client_id, event_name, path, timestamp)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
`;

/**
 * Hourly aggregated custom events
 */
const CREATE_CUSTOM_EVENTS_HOURLY_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.custom_events_hourly (
  client_id String CODEC(ZSTD(1)),
  path String CODEC(ZSTD(1)),
  event_name LowCardinality(String) CODEC(ZSTD(1)),
  hour DateTime CODEC(Delta(4), ZSTD(1)),
  
  event_count UInt64 CODEC(ZSTD(1)),
  unique_users AggregateFunction(uniq, String),
  unique_sessions AggregateFunction(uniq, String)
) ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (client_id, event_name, path, hour)
TTL toDateTime(hour) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192
`;

/**
 * Daily aggregated pageviews for mini-charts
 */
const CREATE_DAILY_PAGEVIEWS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.daily_pageviews (
  client_id String CODEC(ZSTD(1)),
  date Date CODEC(Delta(2), ZSTD(1)),
  
  pageviews UInt64 CODEC(ZSTD(1)),
  
  INDEX idx_client_id client_id TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(date)
ORDER BY (client_id, date)
TTL toDateTime(date) + INTERVAL 1 YEAR
SETTINGS index_granularity = 8192
`;

/**
 * Materialized view for custom events hourly aggregation
 */
const CREATE_CUSTOM_EVENTS_HOURLY_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASES.ANALYTICS}.custom_events_hourly_mv
TO ${DATABASES.ANALYTICS}.custom_events_hourly
AS SELECT
  client_id,
  path,
  event_name,
  toStartOfHour(timestamp) AS hour,
  count() AS event_count,
  uniqState(anonymous_id) AS unique_users,
  uniqState(session_id) AS unique_sessions
FROM ${DATABASES.ANALYTICS}.custom_event_spans
GROUP BY client_id, path, event_name, hour
`;

/**
 * Materialized view for daily pageviews aggregation
 */
const CREATE_DAILY_PAGEVIEWS_MV = `
CREATE MATERIALIZED VIEW IF NOT EXISTS ${DATABASES.ANALYTICS}.daily_pageviews_mv
TO ${DATABASES.ANALYTICS}.daily_pageviews
AS SELECT
  client_id,
  toDate(time) AS date,
  countIf(event_name = 'screen_view') AS pageviews
FROM ${DATABASES.ANALYTICS}.events
GROUP BY client_id, date
`;

const CREATE_CUSTOM_OUTGOING_LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.ANALYTICS}.outgoing_links (
  id UUID,
  client_id String,
  anonymous_id String,
  session_id String,
  href String,
  text Nullable(String),
  properties String,
  
  timestamp DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
`;

/**
 * Lean AI call spans table - stores individual AI model calls
 * owner_id: The org or user ID that owns this data (from API key)
 */
const CREATE_AI_CALL_SPANS_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.OBSERVABILITY}.ai_call_spans (
  owner_id String CODEC(ZSTD(1)),
  
  timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
  
  type LowCardinality(String) CODEC(ZSTD(1)),
  model String CODEC(ZSTD(1)),
  provider LowCardinality(String) CODEC(ZSTD(1)),
  finish_reason LowCardinality(Nullable(String)) CODEC(ZSTD(1)),
  
  input_tokens UInt32 CODEC(ZSTD(1)),
  output_tokens UInt32 CODEC(ZSTD(1)),
  total_tokens UInt32 CODEC(ZSTD(1)),
  cached_input_tokens Nullable(UInt32) CODEC(ZSTD(1)),
  cache_creation_input_tokens Nullable(UInt32) CODEC(ZSTD(1)),
  reasoning_tokens Nullable(UInt32) CODEC(ZSTD(1)),
  web_search_count Nullable(UInt16) CODEC(ZSTD(1)),
  
  input_token_cost_usd Nullable(Float64) CODEC(Gorilla, ZSTD(1)),
  output_token_cost_usd Nullable(Float64) CODEC(Gorilla, ZSTD(1)),
  total_token_cost_usd Nullable(Float64) CODEC(Gorilla, ZSTD(1)),
  
  tool_call_count UInt16 CODEC(ZSTD(1)),
  tool_result_count UInt16 CODEC(ZSTD(1)),
  tool_call_names Array(String) CODEC(ZSTD(1)),
  
  duration_ms UInt32 CODEC(ZSTD(1)),
  trace_id Nullable(String) CODEC(ZSTD(1)),
  http_status Nullable(UInt16) CODEC(ZSTD(1)),
  
  error_name LowCardinality(Nullable(String)) CODEC(ZSTD(1)),
  error_message Nullable(String) CODEC(ZSTD(1)),
  error_stack Nullable(String) CODEC(ZSTD(1)),
  
  INDEX idx_owner_id owner_id TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_model model TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_provider provider TYPE bloom_filter(0.01) GRANULARITY 1,
  INDEX idx_error_name error_name TYPE bloom_filter(0.01) GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(timestamp)
ORDER BY (owner_id, provider, model, timestamp)
SETTINGS index_granularity = 8192, ttl_only_drop_parts = 1
`;

const CREATE_UPTIME_TABLE = `
CREATE TABLE IF NOT EXISTS ${DATABASES.UPTIME}.uptime_monitor (
    site_id String CODEC(ZSTD(1)),
    url String CODEC(ZSTD(1)),
    timestamp DateTime64(3, 'UTC') CODEC(Delta(8), ZSTD(1)),
    status UInt8 CODEC(ZSTD(1)),
    http_code UInt16 CODEC(ZSTD(1)),
    ttfb_ms UInt32 CODEC(ZSTD(1)),
    total_ms UInt32 CODEC(ZSTD(1)),
    attempt UInt8 DEFAULT 1 CODEC(ZSTD(1)),
    retries UInt8 DEFAULT 0 CODEC(ZSTD(1)),
    failure_streak UInt16 DEFAULT 0 CODEC(ZSTD(1)),
    response_bytes UInt32 DEFAULT 0 CODEC(ZSTD(1)),
    content_hash String CODEC(ZSTD(1)),
    redirect_count UInt8 DEFAULT 0 CODEC(ZSTD(1)),
    probe_region LowCardinality(String) DEFAULT 'default',
    probe_ip String CODEC(ZSTD(1)),
    ssl_expiry DateTime64(3, 'UTC') DEFAULT NULL,
    ssl_valid UInt8 DEFAULT 1 CODEC(ZSTD(1)),
    env LowCardinality(String) DEFAULT 'prod',
    check_type LowCardinality(String) DEFAULT 'http',
    user_agent String DEFAULT 'uptime-monitor',
    error String DEFAULT '' CODEC(ZSTD(1)),
    json_data String DEFAULT '' CODEC(ZSTD(1)),
    INDEX idx_site_id site_id TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_status status TYPE minmax GRANULARITY 1,
    INDEX idx_timestamp timestamp TYPE minmax GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toYYYYMM(timestamp)
ORDER BY (site_id, timestamp)
SETTINGS index_granularity = 8192
`;

/**
 * Lean error span type
 */
export interface ErrorSpanRow {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	error_type: string;
}

/**
 * Error hourly aggregate type
 */
export interface ErrorHourlyAggregate {
	client_id: string;
	path: string;
	error_type: string;
	message_hash: number;
	hour: number;
	error_count: number;
	affected_users: number;
	affected_sessions: number;
	sample_message: string;
}

/**
 * Web Vitals metric names
 * Rating computed at query time using standard thresholds
 */
export type WebVitalMetricName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB" | "FPS";

/**
 * Spans-oriented Web Vitals
 * Each row = single metric measurement
 */
export interface WebVitalsSpan {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	metric_name: WebVitalMetricName;
	metric_value: number;
}

/**
 * Web Vitals hourly aggregate type
 */
export interface WebVitalsHourlyAggregate {
	client_id: string;
	path: string;
	metric_name: WebVitalMetricName;
	hour: number;
	sample_count: number;
	p75: number;
	p50: number;
	avg_value: number;
	min_value: number;
	max_value: number;
}

export interface BlockedTraffic {
	id: string;
	client_id?: string;
	timestamp: number;
	path?: string;
	url?: string;
	referrer?: string;
	method: string;
	origin?: string;
	ip: string;
	user_agent?: string;
	accept_header?: string;
	language?: string;
	block_reason: string;
	block_category: string;
	bot_name?: string;
	country?: string;
	region?: string;
	city?: string;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	payload_size?: number;
	created_at: number;
}

export interface EmailEvent {
	event_id: string;
	email_hash: string;
	domain: string;
	labels: string[];
	event_time: number;
	received_at: number;
	ingestion_time: number;
	metadata_json: string;
}

/**
 * Lean custom event span
 */
export interface CustomEventSpan {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	event_name: string;
	properties: Record<string, unknown>;
}

/**
 * Custom events hourly aggregate type
 */
export interface CustomEventsHourlyAggregate {
	client_id: string;
	path: string;
	event_name: string;
	hour: number;
	event_count: number;
	unique_users: number;
	unique_sessions: number;
}

/**
 * Daily pageviews aggregate type
 */
export interface DailyPageviewsAggregate {
	client_id: string;
	date: string;
	pageviews: number;
}

export interface CustomOutgoingLink {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	href: string;
	text?: string;
	properties: string;
	timestamp: number;
}

export interface UptimeMonitor {
	site_id: string;
	url: string;
	timestamp: number;
	status: number;
	http_code: number;
	ttfb_ms: number;
	total_ms: number;
	attempt: number;
	failure_streak: number;
	response_bytes: number;
	content_hash: string;
	redirect_count: number;
	probe_region: string;
	probe_ip: string;
	ssl_expiry?: number;
	ssl_valid: number;
	env: string;
	check_type: string;
	user_agent: string;
	error: string;
	json_data?: string;
}

/**
 * AI call span type
 * owner_id: The org or user ID that owns this data (from API key)
 */
export interface AICallSpan {
	owner_id: string;
	timestamp: number;
	type: "generate" | "stream";
	model: string;
	provider: string;
	finish_reason?: string;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	cached_input_tokens?: number;
	cache_creation_input_tokens?: number;
	reasoning_tokens?: number;
	web_search_count?: number;
	input_token_cost_usd?: number;
	output_token_cost_usd?: number;
	total_token_cost_usd?: number;
	tool_call_count: number;
	tool_result_count: number;
	tool_call_names: string[];
	duration_ms: number;
	trace_id?: string;
	http_status?: number;
	error_name?: string;
	error_message?: string;
	error_stack?: string;
}

export interface LinkVisit {
	id: string;
	link_id: string;
	workspace_id: string;
	visited_at: number;
	referer?: string;
	user_agent?: string;
	ip_hash: string;
	country?: string;
	region?: string;
	city?: string;
	browser_name?: string;
	device_type?: string;
}

export interface AnalyticsEvent {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: number;
	session_id: string;

	event_type?: "track" | "error" | "web_vitals";
	event_id?: string;
	session_start_time?: number;
	timestamp?: number;

	referrer?: string;
	url: string;
	path: string;
	title?: string;

	ip: string;
	user_agent: string;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	device_brand?: string;
	device_model?: string;
	country?: string;
	region?: string;
	city?: string;

	screen_resolution?: string;
	viewport_size?: string;
	language?: string;
	timezone?: string;

	connection_type?: string;
	rtt?: number;
	downlink?: number;

	time_on_page?: number;
	scroll_depth?: number;
	interaction_count?: number;
	page_count: number;

	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;

	load_time?: number;
	dom_ready_time?: number;
	dom_interactive?: number;
	ttfb?: number;
	connection_time?: number;
	render_time?: number;
	redirect_time?: number;
	domain_lookup_time?: number;

	properties: string;

	created_at: number;
}

/**
 * Initialize the ClickHouse schema by creating necessary database and tables
 */
export async function initClickHouseSchema() {
	try {
		console.info("Initializing ClickHouse schema...");

		for (const database of Object.values(DATABASES)) {
			await clickHouse.command({
				query: `CREATE DATABASE IF NOT EXISTS ${database}`,
			});
			console.info(`Created database: ${database}`);
		}

		// Create base tables first
		const tables = [
			{ name: "events", query: CREATE_EVENTS_TABLE },
			{ name: "error_spans", query: CREATE_ERROR_SPANS_TABLE },
			{ name: "error_hourly", query: CREATE_ERROR_HOURLY_TABLE },
			{ name: "web_vitals_spans", query: CREATE_WEB_VITALS_SPANS_TABLE },
			{ name: "web_vitals_hourly", query: CREATE_WEB_VITALS_HOURLY_TABLE },
			{ name: "custom_event_spans", query: CREATE_CUSTOM_EVENT_SPANS_TABLE },
			{
				name: "custom_events_hourly",
				query: CREATE_CUSTOM_EVENTS_HOURLY_TABLE,
			},
			{ name: "daily_pageviews", query: CREATE_DAILY_PAGEVIEWS_TABLE },
			{ name: "blocked_traffic", query: CREATE_BLOCKED_TRAFFIC_TABLE },
			{ name: "email_events", query: CREATE_EMAIL_EVENTS_TABLE },
			{ name: "outgoing_links", query: CREATE_CUSTOM_OUTGOING_LINKS_TABLE },
			{ name: "ai_call_spans", query: CREATE_AI_CALL_SPANS_TABLE },
			{ name: "link_visits", query: CREATE_LINK_VISITS_TABLE },
		];

		// Materialized views (must be created after target tables)
		const materializedViews = [
			{ name: "error_hourly_mv", query: CREATE_ERROR_HOURLY_MV },
			{ name: "web_vitals_hourly_mv", query: CREATE_WEB_VITALS_HOURLY_MV },
			{
				name: "custom_events_hourly_mv",
				query: CREATE_CUSTOM_EVENTS_HOURLY_MV,
			},
			{ name: "daily_pageviews_mv", query: CREATE_DAILY_PAGEVIEWS_MV },
		];

		// Uptime tables
		const uptimeTables = [
			{ name: "uptime_monitor", query: CREATE_UPTIME_TABLE },
		];

		// Create base tables
		for (const table of tables) {
			await clickHouse.command({ query: table.query });
			console.info(`Created table: ${DATABASES.ANALYTICS}.${table.name}`);
		}

		// Create uptime tables
		for (const table of uptimeTables) {
			await clickHouse.command({ query: table.query });
			console.info(`Created table: ${DATABASES.UPTIME}.${table.name}`);
		}

		// Create materialized views (after target tables exist)
		for (const mv of materializedViews) {
			await clickHouse.command({ query: mv.query });
			console.info(
				`Created materialized view: ${DATABASES.ANALYTICS}.${mv.name}`
			);
		}

		console.info("ClickHouse schema initialization completed successfully");
		return {
			success: true,
			message: "ClickHouse schema initialized successfully",
			details: {
				database: DATABASES.ANALYTICS,
				tables: tables.map((t) => t.name),
				materialized_views: materializedViews.map((mv) => mv.name),
				uptime_database: DATABASES.UPTIME,
				uptime_tables: uptimeTables.map((t) => t.name),
			},
		};
	} catch (error) {
		console.error("Error initializing ClickHouse schema:", error);
		return {
			success: false,
			message: "Failed to initialize ClickHouse schema",
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
