// Types based on API response structure from errors.ts query builder

export type RecentError = {
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
	// Additional fields from API response
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	country?: string;
	region?: string;
	country_code?: string;
	country_name?: string;
	created_at?: string;
	severity?: string;
};

export type ErrorType = {
	name: string;
	count: number;
	users: number;
	last_seen: string;
};

export type ErrorByPage = {
	name: string;
	errors: number;
	users: number;
};

export type ErrorSummary = {
	totalErrors: number;
	uniqueErrorTypes: number;
	affectedUsers: number;
	affectedSessions: number;
	errorRate: number;
};

export type ErrorChartData = {
	date: string;
	totalErrors: number;
	affectedUsers: number;
};

export type ProcessedChartData = {
	date: string;
	"Total Errors": number;
	"Affected Users": number;
};
