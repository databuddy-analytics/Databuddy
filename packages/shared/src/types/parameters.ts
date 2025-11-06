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
	device_type: any;
	browser_name: any;
	browsers_grouped: any;
	os_name: any;
	screen_resolution: any;
	connection_type: any;
	country: any;
	region: any;
	city: any;
	timezone: any;
	language: any;
	top_pages: any;
	exit_page: any;
	utm_source: any;
	utm_medium: any;
	utm_campaign: any;
	referrer: any;
	slow_pages: any;
	performance_by_country: any;
	performance_by_device: any;
	performance_by_browser: any;
	performance_by_os: any;
	performance_by_region: any;
	// Error-related parameters
	recent_errors: any;
	error_types: any;
	errors_breakdown: any;
	error_trends: any;
	sessions_summary: any;
	// Custom Events parameters
	custom_events: any;
	custom_event_details: any;
	custom_events_by_page: any;
	custom_events_by_user: any;
	custom_event_properties: any;
	custom_event_property_values: {
		name: string;
		total_events: number;
		unique_users: number;
	};
	// Summary and overview parameters
	summary_metrics: any;
	today_metrics: any;
	events_by_date: any;
	entry_pages: any;
	exit_pages: any;
	top_referrers: any;
	utm_sources: any;
	utm_mediums: any;
	utm_campaigns: any;
	device_types: any;
	browser_versions: any;
	// Revenue parameters
	revenue_summary: any;
	revenue_trends: any;
	recent_transactions: any;
	recent_refunds: any;
	revenue_by_country: any;
	revenue_by_currency: any;
	revenue_by_card_brand: any;
	// Real-time
	active_stats: any;
	latest_events: any;
	// Sessions
	session_list: any;
	// Profiles
	profile_list: any;
	// Retention
	retention_cohorts: any;
	retention_rate: any;
};

// Helper type to extract data types from parameters
export type ExtractDataTypes<T extends (keyof ParameterDataMap)[]> = {
	[K in T[number]]: ParameterDataMap[K][];
};
