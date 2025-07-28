// Parameter and query-related types

export interface ParametersResponse {
	success: boolean;
	parameters: string[];
	categories: {
		device: string[];
		geography: string[];
		pages: string[];
		utm: string[];
		referrers: string[];
		performance: string[];
		errors: string[];
		web_vitals: string[];
		custom_events: string[];
		user_journeys: string[];
		funnel_analysis: string[];
		revenue: string[];
		real_time: string[];
	};
}

export interface QueryOptionsResponse {
	success: boolean;
	types: string[];
	configs: Record<
		string,
		{ allowedFilters: string[]; customizable: boolean; defaultLimit?: number }
	>;
}

// Base interface for common parameter structure
export interface BaseParameterData {
	name: string;
	visitors: number;
	pageviews: number;
}

// Parameter type mapping for better type safety
export type ParameterDataMap = {
	device_type: unknown;
	browser_name: unknown;
	browsers_grouped: unknown;
	os_name: unknown;
	screen_resolution: unknown;
	connection_type: unknown;
	country: unknown;
	region: unknown;
	city: unknown;
	timezone: unknown;
	language: unknown;
	top_pages: unknown;
	exit_page: unknown;
	utm_source: unknown;
	utm_medium: unknown;
	utm_campaign: unknown;
	referrer: unknown;
	slow_pages: unknown;
	performance_by_country: unknown;
	performance_by_device: unknown;
	performance_by_browser: unknown;
	performance_by_os: unknown;
	performance_by_region: unknown;
	// Error-related parameters
	recent_errors: unknown;
	error_types: unknown;
	errors_breakdown: unknown;
	error_trends: unknown;
	sessions_summary: unknown;
	// Custom Events parameters
	custom_events: unknown;
	custom_event_details: unknown;
	custom_events_by_page: unknown;
	custom_events_by_user: unknown;
	custom_event_properties: unknown;
	custom_event_property_values: {
		name: string;
		total_events: number;
		unique_users: number;
	};
	// Summary and overview parameters
	summary_metrics: unknown;
	today_metrics: unknown;
	events_by_date: unknown;
	entry_pages: unknown;
	exit_pages: unknown;
	top_referrers: unknown;
	utm_sources: unknown;
	utm_mediums: unknown;
	utm_campaigns: unknown;
	device_types: unknown;
	browser_versions: unknown;
	// Revenue parameters
	revenue_summary: unknown;
	revenue_trends: unknown;
	recent_transactions: unknown;
	recent_refunds: unknown;
	revenue_by_country: unknown;
	revenue_by_currency: unknown;
	revenue_by_card_brand: unknown;
	// Real-time
	active_stats: unknown;
	latest_events: unknown;
	// Sessions
	session_list: unknown;
	// Profiles
	profile_list: unknown;
};

// Helper type to extract data types from parameters
export type ExtractDataTypes<T extends (keyof ParameterDataMap)[]> = {
	[K in T[number]]: ParameterDataMap[K][];
};
