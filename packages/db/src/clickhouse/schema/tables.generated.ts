// Generated from packages/db/src/clickhouse/schema/**/*.sql — do not edit by hand.
// Regenerate with `bun run generate-db` (repo root) or `bun run generate` in packages/db.
// The .sql DDL is the single source of truth; these types mirror it.
//
// <Table>Row:    read shape — every column present (a query returns them all).
// <Table>Insert: write shape — DEFAULT/Nullable columns optional, MATERIALIZED/ALIAS omitted.

export interface AiTrafficSpansRow {
	client_id: string;
	timestamp: string;
	bot_type: string;
	bot_name: string;
	user_agent: string;
	path: string;
	referrer: string | null;
}

export interface AiTrafficSpansInsert {
	client_id: string;
	timestamp: number | string;
	bot_type: string;
	bot_name: string;
	user_agent: string;
	path: string;
	referrer?: string | null;
}

export interface BlockedTrafficRow {
	id: string;
	client_id: string;
	timestamp: string;
	path: string | null;
	url: string | null;
	referrer: string | null;
	method: string;
	origin: string | null;
	ip: string;
	user_agent: string | null;
	accept_header: string | null;
	language: string | null;
	block_reason: string;
	block_category: string;
	bot_name: string | null;
	country: string | null;
	region: string | null;
	browser_name: string | null;
	browser_version: string | null;
	os_name: string | null;
	os_version: string | null;
	device_type: string | null;
	payload_size: number | null;
	created_at: string;
}

export interface BlockedTrafficInsert {
	id: string;
	client_id: string;
	timestamp: number | string;
	path?: string | null;
	url?: string | null;
	referrer?: string | null;
	method?: string;
	origin?: string | null;
	ip: string;
	user_agent?: string | null;
	accept_header?: string | null;
	language?: string | null;
	block_reason: string;
	block_category: string;
	bot_name?: string | null;
	country?: string | null;
	region?: string | null;
	browser_name?: string | null;
	browser_version?: string | null;
	os_name?: string | null;
	os_version?: string | null;
	device_type?: string | null;
	payload_size?: number | null;
	created_at?: number | string;
}

export interface CustomEventsRow {
	owner_id: string;
	website_id: string | null;
	timestamp: string;
	event_name: string;
	namespace: string | null;
	path: string | null;
	properties: string;
	anonymous_id: string | null;
	session_id: string | null;
	source: string | null;
	profile_id: string;
}

export interface CustomEventsInsert {
	owner_id: string;
	website_id?: string | null;
	timestamp: number | string;
	event_name: string;
	namespace?: string | null;
	path?: string | null;
	properties: string;
	anonymous_id?: string | null;
	session_id?: string | null;
	source?: string | null;
	profile_id?: string;
}

export interface DailyPageviewsRow {
	client_id: string;
	date: string;
	pageviews: number;
}

export interface DailyPageviewsInsert {
	client_id: string;
	date: number | string;
	pageviews: number;
}

export interface ErrorSpansRow {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
	path: string;
	message: string;
	filename: string | null;
	lineno: number | null;
	colno: number | null;
	stack: string | null;
	error_type: string;
}

export interface ErrorSpansInsert {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number | string;
	path: string;
	message: string;
	filename?: string | null;
	lineno?: number | null;
	colno?: number | null;
	stack?: string | null;
	error_type: string;
}

export interface EventsRow {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: string;
	session_id: string;
	referrer: string | null;
	url: string;
	path: string;
	title: string | null;
	ip: string;
	user_agent: string;
	browser_name: string | null;
	browser_version: string | null;
	os_name: string | null;
	os_version: string | null;
	device_type: string | null;
	device_brand: string | null;
	device_model: string | null;
	viewport_size: string | null;
	language: string | null;
	timezone: string | null;
	time_on_page: number | null;
	country: string | null;
	region: string | null;
	city: string | null;
	utm_source: string | null;
	utm_medium: string | null;
	utm_campaign: string | null;
	utm_term: string | null;
	utm_content: string | null;
	gclid: string | null;
	dom_ready_time: number | null;
	ttfb: number | null;
	request_time: number | null;
	render_time: number | null;
	scroll_depth: number | null;
	interaction_count: number | null;
	page_count: number;
	properties: string;
	created_at: string;
	timestamp: string;
	profile_id: string;
}

export interface EventsInsert {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: number | string;
	session_id: string;
	referrer?: string | null;
	url: string;
	path: string;
	title?: string | null;
	ip: string;
	user_agent: string;
	browser_name?: string | null;
	browser_version?: string | null;
	os_name?: string | null;
	os_version?: string | null;
	device_type?: string | null;
	device_brand?: string | null;
	device_model?: string | null;
	viewport_size?: string | null;
	language?: string | null;
	timezone?: string | null;
	time_on_page?: number | null;
	country?: string | null;
	region?: string | null;
	city?: string | null;
	utm_source?: string | null;
	utm_medium?: string | null;
	utm_campaign?: string | null;
	utm_term?: string | null;
	utm_content?: string | null;
	gclid?: string | null;
	dom_ready_time?: number | null;
	ttfb?: number | null;
	request_time?: number | null;
	render_time?: number | null;
	scroll_depth?: number | null;
	interaction_count?: number | null;
	page_count?: number;
	properties: string;
	created_at: number | string;
	timestamp?: number | string;
	profile_id?: string;
}

export interface LinkVisitsRow {
	id: string;
	link_id: string;
	timestamp: string;
	referrer: string | null;
	user_agent: string | null;
	ip_hash: string;
	country: string | null;
	region: string | null;
	city: string | null;
	browser_name: string | null;
	device_type: string | null;
}

export interface LinkVisitsInsert {
	id: string;
	link_id: string;
	timestamp: number | string;
	referrer?: string | null;
	user_agent?: string | null;
	ip_hash: string;
	country?: string | null;
	region?: string | null;
	city?: string | null;
	browser_name?: string | null;
	device_type?: string | null;
}

export interface OutgoingLinksRow {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	href: string;
	text: string | null;
	properties: string;
	timestamp: string;
}

export interface OutgoingLinksInsert {
	id: string;
	client_id: string;
	anonymous_id: string;
	session_id: string;
	href: string;
	text?: string | null;
	properties: string;
	timestamp?: number | string;
}

export interface RevenueRow {
	owner_id: string;
	website_id: string | null;
	transaction_id: string;
	provider: string;
	type: string;
	status: string;
	amount: string;
	original_amount: string;
	original_currency: string;
	currency: string;
	anonymous_id: string | null;
	session_id: string | null;
	customer_id: string;
	product_id: string | null;
	product_name: string | null;
	metadata: string;
	created: string;
	synced_at: string;
	profile_id: string;
}

export interface RevenueInsert {
	owner_id: string;
	website_id?: string | null;
	transaction_id: string;
	provider: string;
	type: string;
	status: string;
	amount: string;
	original_amount: string;
	original_currency: string;
	currency: string;
	anonymous_id?: string | null;
	session_id?: string | null;
	customer_id?: string;
	product_id?: string | null;
	product_name?: string | null;
	metadata?: string;
	created: number | string;
	synced_at: number | string;
	profile_id?: string;
}

export interface WebVitalsSpansRow {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
	path: string;
	metric_name: string;
	metric_value: number;
}

export interface WebVitalsSpansInsert {
	client_id: string;
	anonymous_id: string;
	session_id: string;
	timestamp: number | string;
	path: string;
	metric_name: string;
	metric_value: number;
}

export interface UptimeMonitorRow {
	site_id: string;
	url: string;
	timestamp: string;
	status: number;
	http_code: number;
	ttfb_ms: number;
	total_ms: number;
	attempt: number;
	retries: number;
	failure_streak: number;
	response_bytes: number;
	content_hash: string;
	redirect_count: number;
	probe_region: string;
	probe_ip: string;
	ssl_expiry: string | null;
	ssl_valid: number;
	env: string;
	check_type: string;
	user_agent: string;
	error: string;
	json_data: string;
}

export interface UptimeMonitorInsert {
	site_id: string;
	url: string;
	timestamp: number | string;
	status: number;
	http_code: number;
	ttfb_ms: number;
	total_ms: number;
	attempt?: number;
	retries?: number;
	failure_streak?: number;
	response_bytes?: number;
	content_hash: string;
	redirect_count?: number;
	probe_region?: string;
	probe_ip: string;
	ssl_expiry?: number | string | null;
	ssl_valid?: number;
	env?: string;
	check_type?: string;
	user_agent?: string;
	error?: string;
	json_data?: string;
}

export interface ClickHouseTables {
	ai_traffic_spans: AiTrafficSpansRow;
	blocked_traffic: BlockedTrafficRow;
	custom_events: CustomEventsRow;
	daily_pageviews: DailyPageviewsRow;
	error_spans: ErrorSpansRow;
	events: EventsRow;
	link_visits: LinkVisitsRow;
	outgoing_links: OutgoingLinksRow;
	revenue: RevenueRow;
	web_vitals_spans: WebVitalsSpansRow;
	uptime_monitor: UptimeMonitorRow;
}

export const TABLE_COLUMNS = {
	"analytics.ai_traffic_spans": ["client_id", "timestamp", "bot_type", "bot_name", "user_agent", "path", "referrer"],
	"analytics.blocked_traffic": ["id", "client_id", "timestamp", "path", "url", "referrer", "method", "origin", "ip", "user_agent", "accept_header", "language", "block_reason", "block_category", "bot_name", "country", "region", "browser_name", "browser_version", "os_name", "os_version", "device_type", "payload_size", "created_at"],
	"analytics.custom_events": ["owner_id", "website_id", "timestamp", "event_name", "namespace", "path", "properties", "anonymous_id", "session_id", "source", "profile_id"],
	"analytics.daily_pageviews": ["client_id", "date", "pageviews"],
	"analytics.error_spans": ["client_id", "anonymous_id", "session_id", "timestamp", "path", "message", "filename", "lineno", "colno", "stack", "error_type"],
	"analytics.events": ["id", "client_id", "event_name", "anonymous_id", "time", "session_id", "referrer", "url", "path", "title", "ip", "user_agent", "browser_name", "browser_version", "os_name", "os_version", "device_type", "device_brand", "device_model", "viewport_size", "language", "timezone", "time_on_page", "country", "region", "city", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "dom_ready_time", "ttfb", "request_time", "render_time", "scroll_depth", "interaction_count", "page_count", "properties", "created_at", "timestamp", "profile_id"],
	"analytics.link_visits": ["id", "link_id", "timestamp", "referrer", "user_agent", "ip_hash", "country", "region", "city", "browser_name", "device_type"],
	"analytics.outgoing_links": ["id", "client_id", "anonymous_id", "session_id", "href", "text", "properties", "timestamp"],
	"analytics.revenue": ["owner_id", "website_id", "transaction_id", "provider", "type", "status", "amount", "original_amount", "original_currency", "currency", "anonymous_id", "session_id", "customer_id", "product_id", "product_name", "metadata", "created", "synced_at", "profile_id"],
	"analytics.web_vitals_spans": ["client_id", "anonymous_id", "session_id", "timestamp", "path", "metric_name", "metric_value"],
	"uptime.uptime_monitor": ["site_id", "url", "timestamp", "status", "http_code", "ttfb_ms", "total_ms", "attempt", "retries", "failure_streak", "response_bytes", "content_hash", "redirect_count", "probe_region", "probe_ip", "ssl_expiry", "ssl_valid", "env", "check_type", "user_agent", "error", "json_data"],
} as const satisfies Record<string, readonly string[]>;
