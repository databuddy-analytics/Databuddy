import { clickHouse } from './client';

// Define the analytics database schema with tables for events, sessions, and aggregated data
const ANALYTICS_DATABASE = 'analytics';

// SQL statements for creating the analytics database and tables
const CREATE_DATABASE = `
CREATE DATABASE IF NOT EXISTS ${ANALYTICS_DATABASE}
`;

// Optimizations:
// 1. Use LowCardinality(String) for fields with limited distinct values
// 2. Reorder ORDER BY to prioritize time-based queries
// 3. Add materialized views for common aggregations
// 4. Remove Nullable where 0 is a sensible default

// Events table stores all raw events
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
  downlink Nullable(Float32), -- New field
  
  time_on_page Nullable(Float32),
  scroll_depth Nullable(Float32),
  interaction_count Nullable(Int16),
  exit_intent UInt8,
  page_count UInt8 DEFAULT 1,
  is_bounce UInt8 DEFAULT 1,
  has_exit_intent Nullable(UInt8), -- New field
  page_size Nullable(Int32),
  
  utm_source Nullable(String),
  utm_medium Nullable(String),
  utm_campaign Nullable(String),
  utm_term Nullable(String),
  utm_content Nullable(String),
  
  load_time Nullable(Int32),
  dom_ready_time Nullable(Int32),
  dom_interactive Nullable(Int32), -- New field
  ttfb Nullable(Int32),
  connection_time Nullable(Int32),
  request_time Nullable(Int32),
  render_time Nullable(Int32),
  redirect_time Nullable(Int32), -- New field
  domain_lookup_time Nullable(Int32), -- New field
  
  fcp Nullable(Int32),
  lcp Nullable(Int32),
  cls Nullable(Float32),
  fid Nullable(Int32), -- New field
  inp Nullable(Int32), -- New field
  
  href Nullable(String),
  text Nullable(String),
  
  value Nullable(String),
  
  error_message Nullable(String),
  error_filename Nullable(String),
  error_lineno Nullable(Int32),
  error_colno Nullable(Int32),
  error_stack Nullable(String),
  error_type Nullable(String),
  
  properties String,
  
  created_at DateTime64(3, 'UTC')
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(time)
ORDER BY (client_id, time, id)
SETTINGS index_granularity = 8192
`;

// Dedicated errors table for error events
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

// Dedicated web vitals table for performance metrics
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

// Stripe Payment Intents table
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

// Stripe Charges table
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

// Stripe Refunds table
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

// Email events table for tracking email processing and labeling
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
	metadata: Record<string, unknown>;
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
	metadata: Record<string, unknown>;
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
	metadata_json: Record<string, unknown>;
}

// TypeScript interface that matches the ClickHouse schema
export interface AnalyticsEvent {
	// Core identification
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: number;
	session_id: string;

	// New fields
	event_type?: 'track' | 'error' | 'web_vitals';
	event_id?: string;
	session_start_time?: number;
	timestamp?: number;

	// Page context
	referrer?: string;
	url: string;
	path: string;
	title?: string;

	// Server enrichment
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

	// User context
	screen_resolution?: string;
	viewport_size?: string;
	language?: string;
	timezone?: string;

	// Connection info
	connection_type?: string;
	rtt?: number;
	downlink?: number;

	// Engagement metrics
	time_on_page?: number;
	scroll_depth?: number;
	interaction_count?: number;
	exit_intent: number;
	page_count: number;
	is_bounce: number;
	has_exit_intent?: number;
	page_size?: number;

	// UTM parameters
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;

	// Performance metrics
	load_time?: number;
	dom_ready_time?: number;
	dom_interactive?: number;
	ttfb?: number;
	connection_time?: number;
	request_time?: number;
	render_time?: number;
	redirect_time?: number;
	domain_lookup_time?: number;

	// Web Vitals
	fcp?: number;
	lcp?: number;
	cls?: number;
	fid?: number;
	inp?: number;

	// Link tracking
	href?: string;
	text?: string;

	// Custom event value
	value?: string;

	// Error tracking
	error_message?: string;
	error_filename?: string;
	error_lineno?: number;
	error_colno?: number;
	error_stack?: string;
	error_type?: string;

	// Legacy properties
	properties: string;

	// Metadata
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
		];

		await Promise.all(
			tables.map(async (table) => {
				await clickHouse.command({
					query: table.query,
				});
				console.info(`Created table: ${ANALYTICS_DATABASE}.${table.name}`);
			})
		);

		console.info('ClickHouse schema initialization completed successfully');
		return {
			success: true,
			message: 'ClickHouse schema initialized successfully',
			details: {
				database: ANALYTICS_DATABASE,
				tables: tables.map((t) => t.name),
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
