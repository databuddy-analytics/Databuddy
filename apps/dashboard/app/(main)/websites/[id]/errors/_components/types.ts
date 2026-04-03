// Types based on API response structure from errors.ts query builder

export interface RecentError {
	anonymous_id: string;
	// Additional fields from API response
	browser_name?: string;
	browser_version?: string;
	client_id: string;
	colno?: number;
	country?: string;
	country_code?: string;
	country_name?: string;
	created_at?: string;
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
	severity?: string;
	stack?: string;
	timestamp: string;
	user_agent?: string;
}

export interface ErrorType {
	count: number;
	last_seen: string;
	name: string;
	users: number;
}

export interface ErrorByPage {
	errors: number;
	name: string;
	users: number;
}

export interface ErrorSummary {
	affectedSessions: number;
	affectedUsers: number;
	errorRate: number;
	totalErrors: number;
	uniqueErrorTypes: number;
}

export interface ErrorChartData {
	affectedUsers: number;
	date: string;
	totalErrors: number;
}

export interface ProcessedChartData {
	"Affected Users": number;
	date: string;
	"Total Errors": number;
}
