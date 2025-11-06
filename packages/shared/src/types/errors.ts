// Error-related types based on ClickHouse schema and API responses

/**
 * Raw error event from ClickHouse errors table
 */
export interface ErrorEvent {
	id: string;
	client_id: string;
	event_id?: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
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
	country_code?: string;
	country_name?: string;
	region?: string;
	created_at: string;
}

/**
 * Error type aggregation (from error_types query)
 */
export interface ErrorTypeData {
	name: string; // error message
	count: number;
	users: number;
	last_seen: string;
}

/**
 * API response structure for error data
 */
export interface ErrorApiResponse {
	recent_errors: ErrorEvent[];
	error_types: ErrorTypeData[];
	errors_by_page: ErrorByPageData[];
	error_trends: ErrorTrendData[];
	error_frequency: ErrorFrequencyData[];
}

/**
 * Error breakdown by page (from errors_by_page query)
 */
export interface ErrorByPageData {
	name: string; // page path
	errors: number;
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
	date: string;
	count: number;
}

/**
 * Error summary statistics (from error_summary query)
 */
export interface ErrorSummaryData {
	totalErrors: number;
	uniqueErrorTypes: number;
	affectedUsers: number;
	affectedSessions: number;
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
	type: string;
	category: string;
	severity: "high" | "medium" | "low";
}

/**
 * Error table tab configuration
 */
export interface ErrorTab {
	id: string;
	label: string;
	data: any[];
	columns: any[];
}
