// Analytics types for consistent data structures across the app

export interface DateRange {
	end_date: string;
	granularity?: "hourly" | "daily";
	start_date: string;
	timezone?: string;
}

// Base interface for common session/profile structure
export interface BaseSessionData {
	country: string;
	country_code: string;
	country_name: string;
	session_id: string;
}

export interface ProfileData {
	browser_name: string;
	country: string;
	device_type: string;
	first_visit: string;
	last_visit: string;
	os_name: string;
	referrer: string;
	region: string;
	session_count: number;
	total_events: number;
	visitor_id: string;
}

export interface ProfileSessionData extends BaseSessionData {
	error_message?: string;
	error_type?: string;
	event_name: string;
	path: string;
	properties: Record<string, unknown>;
	time: string;
}

export interface SessionData extends BaseSessionData {
	anonymous_id: string;
	browser_name: string;
	device_type: string;
	path: string;
	referrer: string;
	session_start: string;
	time_on_page: number;
	user_agent: string;
}

export interface SummaryMetricsData {
	bounce_rate: number;
	bounce_rate_pct: string;
	median_session_duration: number;
	median_session_duration_formatted: string;
	pages_per_session: number;
	pageviews: number;
	sessions: number;
	unique_visitors: number;
}
