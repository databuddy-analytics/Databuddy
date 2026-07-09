// Generated from packages/db/src/clickhouse/schema/**/*.sql — do not edit by hand.
// Regenerate with `bun run generate-db` (repo root) or `bun run generate` in packages/db.
// The .sql DDL is the single source of truth; these types mirror it.

export interface AiTrafficSpansRow {
	client_id: string;
	timestamp: string;
	bot_type: string;
	bot_name: string;
	user_agent: string;
	path: string;
	referrer: string | null;
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

export interface DailyPageviewsRow {
	client_id: string;
	date: string;
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

export interface WebVitalsHourlyRow {
	client_id: string;
	path: string;
	metric_name: string;
	hour: string;
	sample_count: number;
	p75: number;
	p50: number;
	avg_value: number;
	min_value: number;
	max_value: number;
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
	uptime_monitor: UptimeMonitorRow;
	web_vitals_hourly: WebVitalsHourlyRow;
	web_vitals_spans: WebVitalsSpansRow;
}
