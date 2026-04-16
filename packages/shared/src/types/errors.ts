// Error-related types based on ClickHouse schema and API responses

/**
 * Raw error event from ClickHouse errors table
 */
export interface ErrorEvent {
	anonymous_id: string;
	browser_name?: string;
	browser_version?: string;
	client_id: string;
	colno?: number;
	country?: string;
	country_code?: string;
	country_name?: string;
	created_at: string;
	device_type?: string;
	error_type?: string;
	event_id?: string;
	filename?: string;
	id: string;
	ip?: string;
	lineno?: number;
	message: string;
	os_name?: string;
	os_version?: string;
	path: string;
	region?: string;
	session_id: string;
	stack?: string;
	timestamp: string;
	user_agent?: string;
}

/**
 * Error type aggregation (from error_types query)
 */
export interface ErrorTypeData {
	count: number;
	last_seen: string;
	name: string; // error message
	users: number;
}

/**
 * API response structure for error data
 */
export interface ErrorApiResponse {
	error_frequency: ErrorFrequencyData[];
	error_trends: ErrorTrendData[];
	error_types: ErrorTypeData[];
	errors_by_page: ErrorByPageData[];
	recent_errors: ErrorEvent[];
}

/**
 * Error breakdown by page (from errors_by_page query)
 */
export interface ErrorByPageData {
	errors: number;
	name: string; // page path
	users: number;
}

/**
 * Error trend data (from error_trends query)
 */
export interface ErrorTrendData {
	date: string;
	errors: number;
	users: number;
}

/**
 * Error frequency data (from error_frequency query)
 */
export interface ErrorFrequencyData {
	count: number;
	date: string;
}

/**
 * Error summary statistics (from error_summary query)
 */
export interface ErrorSummaryData {
	affectedSessions: number;
	affectedUsers: number;
	totalErrors: number;
	uniqueErrorTypes: number;
}

/**
 * Processed error summary for UI display
 */
export interface ErrorSummary extends ErrorSummaryData {
	errorRate: number;
}

/**
 * Error categorization result
 */
export interface ErrorCategory {
	category: string;
	severity: "high" | "medium" | "low";
	type: string;
}

/**
 * Error table tab configuration
 */
export interface ErrorTab<TData = unknown> {
	columns: unknown[];
	data: TData[];
	getFilter?: (row: TData) => { field: string; value: string };
	id: string;
	label: string;
}
