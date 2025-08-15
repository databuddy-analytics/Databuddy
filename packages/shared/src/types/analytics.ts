// Analytics types for consistent data structures across the app

export interface DateRange {
	start_date: string;
	end_date: string;
	granularity?: 'hourly' | 'daily';
	timezone?: string;
}

// Base interface for common session/profile structure
export interface BaseSessionData {
	session_id: string;
	country: string;
	country_name: string;
	country_code: string;
}

export interface ProfileData {
	visitor_id: string;
	first_visit: string;
	last_visit: string;
	total_sessions: number;
	total_pageviews: number;
	total_duration: number;
	total_duration_formatted: string;
	device: string;
	browser: string;
	os: string;
	country: string;
	country_name: string;
	country_code: string;
	region: string;
	sessions: ProfileSessionData[];
}

export interface ProfileSessionData extends BaseSessionData {
	time: string;
	event_name: string;
	path: string;
	error_message?: string;
	error_type?: string;
	properties: Record<string, unknown>;
}

export interface SessionData extends BaseSessionData {
	anonymous_id: string;
	session_start: string;
	path: string;
	referrer: string;
	device_type: string;
	browser_name: string;
	time_on_page: number;
	user_agent: string;
}

export interface SummaryMetricsData {
	unique_visitors: number;
	sessions: number;
	pageviews: number;
	bounce_rate: number;
	bounce_rate_pct: string;
	avg_session_duration: number;
	avg_session_duration_formatted: string;
	pages_per_session: number;
}
