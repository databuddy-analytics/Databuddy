import { clickHouse } from './client';

const ANALYTICS_DATABASE = 'analytics';
const OBSERVABILITY_DATABASE = 'observability';

const CREATE_DATABASE = `
CREATE DATABASE IF NOT EXISTS ${ANALYTICS_DATABASE}
`;

const CREATE_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.events (
  id UUID,
  client_id String,
  event_name String,
  anonymous_id String,
  time DateTime64(3, 'UTC'),
  session_id String,
  
  event_type LowCardinality(String) DEFAULT 'track', -- 'track', 'error', 'web_vitals'
  event_id Nullable(String), -- UUID from client for deduplication
  session_start_time Nullable(DateTime64(3, 'UTC')), -- New session tracking
  timestamp DateTime64(3, 'UTC') DEFAULT time, -- Alias for new format
  
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
  
  href Nullable(String),
  text Nullable(String),
  
  value Nullable(String),
  
  properties String,
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (client_id, time, id)
SETTINGS index_granularity = 8192
`;

const CREATE_ERRORS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.errors (
  id UUID,
  client_id String,
  event_id Nullable(String),
  
  anonymous_id String,
  session_id String,
  timestamp DateTime64(3, 'UTC'),
  
  path String,
  
  message String,
  filename Nullable(String),
  lineno Nullable(Int32),
  colno Nullable(Int32),
  stack Nullable(String),
  error_type Nullable(String),
  
  ip Nullable(String),
  user_agent Nullable(String),
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  country Nullable(String),
  region Nullable(String),
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
`;

const CREATE_WEB_VITALS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.web_vitals (
  id UUID,
  client_id String,
  event_id Nullable(String),
  
  anonymous_id String,
  session_id String,
  timestamp DateTime64(3, 'UTC'),
  
  path String,
  
  fcp Nullable(Int32),
  lcp Nullable(Int32),
  cls Nullable(Float32),
  fid Nullable(Int32),
  inp Nullable(Int32),
  
  ip Nullable(String),
  user_agent Nullable(String),
  browser_name Nullable(String),
  browser_version Nullable(String),
  os_name Nullable(String),
  os_version Nullable(String),
  device_type Nullable(String),
  country Nullable(String),
  region Nullable(String),
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
`;

const CREATE_STRIPE_PAYMENT_INTENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.stripe_payment_intents (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  status LowCardinality(String),
  currency LowCardinality(String),
  amount UInt64,
  amount_received UInt64,
  amount_capturable UInt64,
  livemode UInt8,
  metadata JSON,
  payment_method_types Array(String),
  failure_reason Nullable(String),
  canceled_at Nullable(DateTime64(3, 'UTC')),
  cancellation_reason Nullable(String),
  description Nullable(String),
  application_fee_amount Nullable(UInt64),
  setup_future_usage Nullable(String),
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192
`;

const CREATE_STRIPE_CHARGES_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.stripe_charges (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  status LowCardinality(String),
  currency LowCardinality(String),
  amount UInt64,
  amount_captured UInt64,
  amount_refunded UInt64,
  paid UInt8,
  refunded UInt8,
  livemode UInt8,
  failure_code Nullable(String),
  failure_message Nullable(String),
  outcome_type Nullable(String),
  risk_level LowCardinality(String),
  card_brand LowCardinality(String),
  payment_intent_id Nullable(String),
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192
`;

const CREATE_STRIPE_REFUNDS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.stripe_refunds (
  id String,
  client_id String,
  webhook_token String,
  created DateTime64(3, 'UTC'),
  amount UInt64,
  status LowCardinality(String),
  reason LowCardinality(String),
  currency LowCardinality(String),
  charge_id String,
  payment_intent_id Nullable(String),
  metadata JSON,
  session_id Nullable(String),
  created_at DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(created)
ORDER BY (client_id, webhook_token, created, id)
SETTINGS index_granularity = 8192
`;

const CREATE_BLOCKED_TRAFFIC_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.blocked_traffic (
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
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.email_events (
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

const CREATE_OBSERVABILITY_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${OBSERVABILITY_DATABASE}.events (
    id UUID DEFAULT generateUUIDv4(),

    service String,
    environment LowCardinality(String),
    version Nullable(String),
    host Nullable(String),
    region Nullable(String),
    instance_id Nullable(String),

    trace_id Nullable(String),
    span_id Nullable(String),
    parent_span_id Nullable(String),
    span_kind LowCardinality(String),
    status_code LowCardinality(String),
    status_message Nullable(String),

    start_time DateTime64(3, 'UTC') DEFAULT now(),
    end_time DateTime64(3, 'UTC') DEFAULT now(),
    duration_ms Nullable(UInt32) MATERIALIZED (toUInt32(dateDiff('millisecond', start_time, end_time))),

    level LowCardinality(String),
    category LowCardinality(String),
    request_id Nullable(String),
    correlation_id Nullable(String),

    user_id Nullable(String),
    tenant_id Nullable(String),

    attributes JSON,
    events JSON

) ENGINE = MergeTree
PARTITION BY toYYYYMM(start_time)
ORDER BY (service, environment, category, level, start_time)
SETTINGS index_granularity = 8192
`;

const CREATE_OTEL_TRACES_TABLE = `
CREATE TABLE IF NOT EXISTS ${OBSERVABILITY_DATABASE}.otel_traces (
    Timestamp DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId String CODEC(ZSTD(1)),
    TenantId String CODEC(ZSTD(1)),
    SpanId String CODEC(ZSTD(1)),
    ParentSpanId String CODEC(ZSTD(1)),
    TraceState String CODEC(ZSTD(1)),
    SpanName LowCardinality(String) CODEC(ZSTD(1)),
    SpanKind LowCardinality(String) CODEC(ZSTD(1)),
    ServiceName LowCardinality(String) CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeName String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    SpanAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    Duration Int64 CODEC(ZSTD(1)),
    StatusCode LowCardinality(String) CODEC(ZSTD(1)),
    StatusMessage String CODEC(ZSTD(1)),
    Events Nested(
        Timestamp DateTime64(9),
        Name LowCardinality(String),
        Attributes Map(LowCardinality(String), String)
    ),
    Links Nested(
        TraceId String,
        SpanId String,
        TraceState String,
        Attributes Map(LowCardinality(String), String)
    ),
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_key mapKeys(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_span_attr_value mapValues(SpanAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_duration Duration TYPE minmax GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SpanName, toUnixTimestamp(Timestamp), TraceId)
TTL toDateTime(Timestamp) + toIntervalDay(3)
SETTINGS ttl_only_drop_parts = 1
`;

const CREATE_OTEL_LOGS_TABLE = `
CREATE TABLE IF NOT EXISTS ${OBSERVABILITY_DATABASE}.otel_logs (
    Timestamp DateTime64(9) CODEC(Delta(8), ZSTD(1)),
    TraceId String CODEC(ZSTD(1)),
    TenantId String CODEC(ZSTD(1)),
    SpanId String CODEC(ZSTD(1)),
    TraceFlags UInt32 CODEC(ZSTD(1)),
    SeverityText LowCardinality(String) CODEC(ZSTD(1)),
    SeverityNumber Int32 CODEC(ZSTD(1)),
    ServiceName LowCardinality(String) CODEC(ZSTD(1)),
    Body String CODEC(ZSTD(1)),
    ResourceSchemaUrl String CODEC(ZSTD(1)),
    ResourceAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    ScopeSchemaUrl String CODEC(ZSTD(1)),
    ScopeName String CODEC(ZSTD(1)),
    ScopeVersion String CODEC(ZSTD(1)),
    ScopeAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    LogAttributes Map(LowCardinality(String), String) CODEC(ZSTD(1)),
    INDEX idx_trace_id TraceId TYPE bloom_filter(0.001) GRANULARITY 1,
    INDEX idx_res_attr_key mapKeys(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_res_attr_value mapValues(ResourceAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_key mapKeys(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_scope_attr_value mapValues(ScopeAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_log_attr_key mapKeys(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_log_attr_value mapValues(LogAttributes) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX idx_body Body TYPE tokenbf_v1(32768, 3, 0) GRANULARITY 1
) ENGINE = MergeTree
PARTITION BY toDate(Timestamp)
ORDER BY (ServiceName, SeverityText, toUnixTimestamp(Timestamp), TraceId)
TTL toDateTime(Timestamp) + toIntervalDay(3)
SETTINGS ttl_only_drop_parts = 1
`;

const CREATE_CUSTOM_EVENTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.custom_events (
  id UUID,
  client_id String,
  event_name String,
  anonymous_id String,
  session_id String,
  properties String,
  
  timestamp DateTime64(3, 'UTC') DEFAULT now()
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (client_id, timestamp, id)
SETTINGS index_granularity = 8192
`;

// Custom outgoing links table with minimal essential fields
const CREATE_CUSTOM_OUTGOING_LINKS_TABLE = `
CREATE TABLE IF NOT EXISTS ${ANALYTICS_DATABASE}.outgoing_links (
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

export interface ErrorEvent {
	id: string;
	client_id: string;
	event_id?: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	error_type?: string;
	ip?: string;
	user_agent?: string;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	country?: string;
	region?: string;
	created_at: number;
}

export interface WebVitalsEvent {
	id: string;
	client_id: string;
	event_id?: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number;
	path: string;
	fcp?: number;
	lcp?: number;
	cls?: number;
	fid?: number;
	inp?: number;
	ip?: string;
	user_agent?: string;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	country?: string;
	region?: string;
	created_at: number;
}

// Stripe table interfaces
export interface StripePaymentIntent {
	id: string;
	client_id: string;
	webhook_token: string;
	created: number;
	status: string;
	currency: string;
	amount: number;
	amount_received: number;
	amount_capturable: number;
	livemode: number;
	metadata: JSON;
	payment_method_types: string[];
	failure_reason?: string;
	canceled_at?: number;
	cancellation_reason?: string;
	description?: string;
	application_fee_amount?: number;
	setup_future_usage?: string;
	session_id?: string;
}

export interface StripeCharge {
	id: string;
	client_id: string;
	webhook_token: string;
	created: number;
	status: string;
	currency: string;
	amount: number;
	amount_captured: number;
	amount_refunded: number;
	paid: number;
	refunded: number;
	livemode: number;
	failure_code?: string;
	failure_message?: string;
	outcome_type?: string;
	risk_level?: string;
	card_brand?: string;
	payment_intent_id?: string;
	session_id?: string;
}

export interface StripeRefund {
	id: string;
	client_id: string;
	webhook_token: string;
	created: number;
	amount: number;
	status: string;
	reason?: string;
	currency: string;
	charge_id: string;
	payment_intent_id?: string;
	metadata: JSON;
	session_id?: string;
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
	metadata_json: JSON;
}

export interface ObservabilityEvent {
	id: string;
	service: string;
	environment: string;
	version?: string;
	host?: string;
	region?: string;
	instance_id?: string;
	trace_id?: string;
	span_id?: string;
	parent_span_id?: string;
	span_kind?: string;
	status_code?: string;
	status_message?: string;
	start_time: number;
	end_time: number;
	duration_ms?: number;
	level: string;
	category: string;
	request_id?: string;
	correlation_id?: string;
	user_id?: string;
	tenant_id?: string;
	attributes: JSON;
	events: JSON;
}

// OpenTelemetry trace span interface
export interface OTelTraces {
	Timestamp: number;
	TraceId: string;
	SpanId: string;
	ParentSpanId: string;
	TraceState: string;
	SpanName: string;
	SpanKind: string;
	ServiceName: string;
	ResourceAttributes: Record<string, string>;
	ScopeName: string;
	ScopeVersion: string;
	SpanAttributes: Record<string, string>;
	Duration: number;
	StatusCode: string;
	StatusMessage: string;
	'Events.Timestamp': number[];
	'Events.Name': string[];
	'Events.Attributes': Record<string, string>[];
	'Links.TraceId': string[];
	'Links.SpanId': string[];
	'Links.TraceState': string[];
	'Links.Attributes': Record<string, string>[];
}

// OpenTelemetry logs interface
export interface OTelLogs {
	Timestamp: number;
	TraceId: string;
	SpanId: string;
	TraceFlags: number;
	SeverityText: string;
	SeverityNumber: number;
	ServiceName: string;
	Body: string;
	ResourceSchemaUrl: string;
	ResourceAttributes: Record<string, string>;
	ScopeSchemaUrl: string;
	ScopeName: string;
	ScopeVersion: string;
	ScopeAttributes: Record<string, string>;
	LogAttributes: Record<string, string>;
}

export interface CustomEvent {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	session_id: string;
	properties: string;
	timestamp: number;
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

export interface AnalyticsEvent {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: number;
	session_id: string;

	event_type?: 'track' | 'error' | 'web_vitals';
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

	href?: string;
	text?: string;

	value?: string;

	properties: string;

	created_at: number;
}

/**
 * Initialize the ClickHouse schema by creating necessary database and tables
 */
export async function initClickHouseSchema() {
	try {
		console.info('Initializing ClickHouse schema...');

		// Create the analytics database
		await clickHouse.command({
			query: CREATE_DATABASE,
		});
		console.info(`Created database: ${ANALYTICS_DATABASE}`);

		// Create the observability database
		await clickHouse.command({
			query: `CREATE DATABASE IF NOT EXISTS ${OBSERVABILITY_DATABASE}`,
		});
		console.info(`Created database: ${OBSERVABILITY_DATABASE}`);

		// Create tables
		const tables = [
			{ name: 'events', query: CREATE_EVENTS_TABLE },
			{ name: 'errors', query: CREATE_ERRORS_TABLE },
			{ name: 'web_vitals', query: CREATE_WEB_VITALS_TABLE },
			{
				name: 'stripe_payment_intents',
				query: CREATE_STRIPE_PAYMENT_INTENTS_TABLE,
			},
			{ name: 'stripe_charges', query: CREATE_STRIPE_CHARGES_TABLE },
			{ name: 'stripe_refunds', query: CREATE_STRIPE_REFUNDS_TABLE },
			{ name: 'blocked_traffic', query: CREATE_BLOCKED_TRAFFIC_TABLE },
			{ name: 'email_events', query: CREATE_EMAIL_EVENTS_TABLE },
			{ name: 'custom_events', query: CREATE_CUSTOM_EVENTS_TABLE },
			{ name: 'outgoing_links', query: CREATE_CUSTOM_OUTGOING_LINKS_TABLE },
			{
				name: 'observability_events',
				query: CREATE_OBSERVABILITY_EVENTS_TABLE,
			},
		];

		// Create observability tables separately
		const observabilityTables = [
			{ name: 'otel_traces', query: CREATE_OTEL_TRACES_TABLE },
			{ name: 'otel_logs', query: CREATE_OTEL_LOGS_TABLE },
		];

		await Promise.all(
			tables.map(async (table) => {
				await clickHouse.command({
					query: table.query,
				});
				console.info(`Created table: ${ANALYTICS_DATABASE}.${table.name}`);
			})
		);

		// Create observability tables
		await Promise.all(
			observabilityTables.map(async (table) => {
				await clickHouse.command({
					query: table.query,
				});
				console.info(`Created table: ${OBSERVABILITY_DATABASE}.${table.name}`);
			})
		);

		console.info('ClickHouse schema initialization completed successfully');
		return {
			success: true,
			message: 'ClickHouse schema initialized successfully',
			details: {
				database: ANALYTICS_DATABASE,
				tables: tables.map((t) => t.name),
				observability_database: OBSERVABILITY_DATABASE,
				observability_tables: observabilityTables.map((t) => t.name),
			},
		};
	} catch (error) {
		console.error('Error initializing ClickHouse schema:', error);
		return {
			success: false,
			message: 'Failed to initialize ClickHouse schema',
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
