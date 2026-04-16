// Parameter and query-related types

export interface ParametersResponse {
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
	parameters: string[];
	success: boolean;
}

export interface QueryOptionsResponse {
	configs: Record<
		string,
		{ allowedFilters: string[]; customizable: boolean; defaultLimit?: number }
	>;
	success: boolean;
	types: string[];
}

// Base interface for common parameter structure
export interface BaseParameterData {
	name: string;
	pageviews: number;
	visitors: number;
}

export interface LlmOverviewKpiRow {
	avg_duration_ms: number;
	cache_hit_rate: number;
	error_count: number;
	error_rate: number;
	input_tokens: number;
	output_tokens: number;
	p75_duration_ms: number;
	tool_use_rate: number;
	total_calls: number;
	total_cost: number;
	total_tokens: number;
	web_search_rate: number;
}

export interface LlmTimeSeriesRow {
	avg_duration_ms: number;
	date: string;
	p75_duration_ms: number;
	total_calls: number;
	total_cost: number;
	total_tokens: number;
}

export interface LlmBreakdownRow {
	avg_duration_ms?: number;
	calls: number;
	error_rate?: number;
	model?: string;
	name: string;
	p75_duration_ms?: number;
	provider?: string;
	total_cost?: number;
	total_tokens?: number;
}

export interface LlmFinishReasonRow {
	calls: number;
	finish_reason: string;
	name: string;
}

export interface LlmErrorBreakdownRow {
	error_count: number;
	error_name: string;
	name: string;
	sample_message: string;
}

export interface LlmCostSeriesRow {
	date: string;
	model?: string;
	provider?: string;
	total_cost: number;
}

export interface LlmLatencySeriesRow {
	avg_duration_ms: number;
	date: string;
	p75_duration_ms: number;
	p95_duration_ms: number;
}

export interface LlmLatencyBreakdownRow {
	avg_duration_ms: number;
	calls: number;
	model?: string;
	name: string;
	p50_duration_ms: number;
	p75_duration_ms: number;
	p95_duration_ms: number;
	provider?: string;
}

export interface LlmSlowCallRow {
	duration_ms: number;
	error_name?: string;
	finish_reason?: string;
	model: string;
	provider: string;
	timestamp: string;
	total_tokens: number;
	trace_id?: string;
}

export interface LlmErrorRateSeriesRow {
	date: string;
	error_count: number;
	error_rate: number;
}

export interface LlmHttpStatusRow {
	calls: number;
	http_status: number;
	name: string;
}

export interface LlmRecentErrorRow {
	duration_ms: number;
	error_message: string;
	error_name: string;
	http_status?: number;
	model: string;
	provider: string;
	timestamp: string;
}

export interface LlmToolUseSeriesRow {
	avg_tool_calls: number;
	avg_tool_results: number;
	date: string;
	tool_use_rate: number;
}

export interface LlmToolNameRow {
	calls: number;
	name: string;
	tool_name: string;
}

export interface LlmTraceSummaryRow {
	avg_duration_ms: number;
	calls: number;
	errors: number;
	name: string;
	p75_duration_ms: number;
	total_cost: number;
	total_tokens: number;
	trace_id: string;
	user_id: string;
	website_id?: string;
}

export interface LlmRecentCallRow {
	duration_ms: number;
	error_name?: string;
	finish_reason?: string;
	model: string;
	provider: string;
	timestamp: string;
	total_token_cost_usd: number;
	total_tokens: number;
	trace_id?: string;
	user_id?: string;
}

interface GenericParameterRow {
	[key: string]: string | number | boolean | null | undefined;
}

// Parameter type mapping for better type safety
export interface ParameterDataMap {
	// Real-time
	active_stats: GenericParameterRow;
	browser_name: GenericParameterRow;
	browser_versions: GenericParameterRow;
	browsers_grouped: GenericParameterRow;
	city: GenericParameterRow;
	connection_type: GenericParameterRow;
	country: GenericParameterRow;
	custom_event_details: GenericParameterRow;
	custom_event_properties: GenericParameterRow;
	custom_event_property_values: {
		name: string;
		total_events: number;
		unique_users: number;
	};
	// Custom Events parameters
	custom_events: GenericParameterRow;
	custom_events_by_page: GenericParameterRow;
	custom_events_by_user: GenericParameterRow;
	device_type: GenericParameterRow;
	device_types: GenericParameterRow;
	entry_pages: GenericParameterRow;
	error_trends: GenericParameterRow;
	error_types: GenericParameterRow;
	errors_breakdown: GenericParameterRow;
	events_by_date: GenericParameterRow;
	exit_page: GenericParameterRow;
	exit_pages: GenericParameterRow;
	language: GenericParameterRow;
	latest_events: GenericParameterRow;
	llm_cost_by_model_time_series: LlmCostSeriesRow;
	llm_cost_by_provider_time_series: LlmCostSeriesRow;
	llm_error_breakdown: LlmErrorBreakdownRow;
	llm_error_rate_time_series: LlmErrorRateSeriesRow;
	llm_finish_reason_breakdown: LlmFinishReasonRow;
	llm_http_status_breakdown: LlmHttpStatusRow;
	llm_latency_by_model: LlmLatencyBreakdownRow;
	llm_latency_by_provider: LlmLatencyBreakdownRow;
	llm_latency_time_series: LlmLatencySeriesRow;
	llm_model_breakdown: LlmBreakdownRow;
	llm_overview_kpis: LlmOverviewKpiRow;
	llm_provider_breakdown: LlmBreakdownRow;
	llm_recent_calls: LlmRecentCallRow;
	llm_recent_errors: LlmRecentErrorRow;
	llm_slowest_calls: LlmSlowCallRow;
	llm_time_series: LlmTimeSeriesRow;
	llm_tool_name_breakdown: LlmToolNameRow;
	llm_tool_use_time_series: LlmToolUseSeriesRow;
	llm_trace_summary: LlmTraceSummaryRow;
	os_name: GenericParameterRow;
	performance_by_browser: GenericParameterRow;
	performance_by_country: GenericParameterRow;
	performance_by_device: GenericParameterRow;
	performance_by_os: GenericParameterRow;
	performance_by_region: GenericParameterRow;
	// Profiles
	profile_list: GenericParameterRow;
	// Error-related parameters
	recent_errors: GenericParameterRow;
	recent_transactions: GenericParameterRow;
	referrer: GenericParameterRow;
	region: GenericParameterRow;
	// Retention
	retention_cohorts: GenericParameterRow;
	retention_rate: GenericParameterRow;
	revenue_by_product: GenericParameterRow;
	revenue_by_provider: GenericParameterRow;
	// Revenue parameters
	revenue_overview: GenericParameterRow;
	revenue_time_series: GenericParameterRow;
	screen_resolution: GenericParameterRow;
	// Sessions
	session_list: GenericParameterRow;
	sessions_summary: GenericParameterRow;
	slow_pages: GenericParameterRow;
	// Summary and overview parameters
	summary_metrics: GenericParameterRow;
	timezone: GenericParameterRow;
	today_metrics: GenericParameterRow;
	top_pages: GenericParameterRow;
	top_referrers: GenericParameterRow;
	utm_campaign: GenericParameterRow;
	utm_campaigns: GenericParameterRow;
	utm_medium: GenericParameterRow;
	utm_mediums: GenericParameterRow;
	utm_source: GenericParameterRow;
	utm_sources: GenericParameterRow;
}

// Helper type to extract data types from parameters
export type ExtractDataTypes<T extends (keyof ParameterDataMap)[]> = {
	[K in T[number]]: ParameterDataMap[K][];
};
