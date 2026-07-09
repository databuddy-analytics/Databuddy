export interface ErrorSpanRow {
	anonymous_id: string;
	client_id: string;
	colno?: number;
	error_type: string;
	filename?: string;
	lineno?: number;
	message: string;
	path: string;
	session_id: string;
	stack?: string;
	timestamp: number;
}

export type WebVitalMetricName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB" | "FPS";

export interface WebVitalsSpan {
	anonymous_id: string;
	client_id: string;
	metric_name: WebVitalMetricName;
	metric_value: number;
	path: string;
	session_id: string;
	timestamp: number;
}

export interface WebVitalsHourlyAggregate {
	avg_value: number;
	client_id: string;
	hour: number;
	max_value: number;
	metric_name: WebVitalMetricName;
	min_value: number;
	p50: number;
	p75: number;
	path: string;
	sample_count: number;
}

export interface BlockedTraffic {
	accept_header?: string;
	block_category: string;
	block_reason: string;
	bot_name?: string;
	browser_name?: string;
	browser_version?: string;
	city?: string;
	client_id?: string;
	country?: string;
	created_at: number;
	device_type?: string;
	id: string;
	ip: string;
	language?: string;
	method: string;
	origin?: string;
	os_name?: string;
	os_version?: string;
	path?: string;
	payload_size?: number;
	referrer?: string;
	region?: string;
	timestamp: number;
	url?: string;
	user_agent?: string;
}

export interface CustomEvent {
	anonymous_id?: string;
	event_name: string;
	namespace?: string;
	owner_id: string;
	path?: string;
	profile_id?: string;
	properties: string;
	session_id?: string;
	source?: string;
	timestamp: number;
	website_id?: string;
}

export interface DailyPageviewsAggregate {
	client_id: string;
	date: string;
	pageviews: number;
}

export interface CustomOutgoingLink {
	anonymous_id: string;
	client_id: string;
	href: string;
	id: string;
	properties: string;
	session_id: string;
	text?: string;
	timestamp: number;
}

export interface AITrafficSpan {
	bot_name: string;
	bot_type: "ai_crawler" | "ai_assistant";
	client_id: string;
	path: string;
	referrer?: string;
	timestamp: number;
	user_agent: string;
}

export interface UptimeMonitor {
	attempt: number;
	check_type: string;
	content_hash: string;
	env: string;
	error: string;
	failure_streak: number;
	http_code: number;
	json_data?: string;
	probe_ip: string;
	probe_region: string;
	redirect_count: number;
	response_bytes: number;
	site_id: string;
	ssl_expiry?: number;
	ssl_valid: number;
	status: number;
	timestamp: number;
	total_ms: number;
	ttfb_ms: number;
	url: string;
	user_agent: string;
}

export interface RevenueTransaction {
	amount: number;
	anonymous_id?: string;
	created: number;
	currency: string;
	customer_id?: string;
	metadata: string | Record<string, unknown>;
	original_amount: number;
	original_currency: string;
	owner_id: string;
	product_id?: string;
	product_name?: string;
	profile_id?: string;
	provider: "stripe" | "paddle";
	session_id?: string;
	status: string;
	synced_at: number;
	transaction_id: string;
	type: "sale" | "refund" | "subscription" | "subscription_event";
	website_id?: string;
}

export interface LinkVisit {
	browser_name?: string;
	city?: string;
	country?: string;
	device_type?: string;
	id: string;
	ip_hash: string;
	link_id: string;
	referrer?: string;
	region?: string;
	timestamp: number;
	user_agent?: string;
}
