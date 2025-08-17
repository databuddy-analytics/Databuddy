// Export-related type definitions

export type ExportFormat = 'csv' | 'json' | 'txt' | 'proto';

export interface ExportRequest {
	website_id: string;
	start_date?: string;
	end_date?: string;
	format?: ExportFormat;
}

export interface ExportFile {
	name: string;
	content: string;
}

export interface ExportMetadata {
	export_date: string;
	website_id: string;
	date_range: {
		start: string;
		end: string;
	};
	format: ExportFormat;
	counts: {
		events: number;
		errors: number;
		web_vitals: number;
	};
}

// Sanitized data interfaces (excluding sensitive fields like IP, user_agent)
export interface SanitizedEvent extends Record<string, unknown> {
	id: string;
	client_id: string;
	event_name: string;
	anonymous_id: string;
	time: string;
	session_id: string;
	referrer?: string;
	url: string;
	path: string;
	title?: string;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	device_brand?: string;
	device_model?: string;
	country?: string;
	region?: string;
	city?: string;
	screen_resolution?: string;
	viewport_size?: string;
	language?: string;
	timezone?: string;
	connection_type?: string;
	rtt?: number;
	time_on_page?: number;
	scroll_depth?: number;
	interaction_count?: number;
	exit_intent: number;
	page_count: number;
	is_bounce: number;
	page_size?: number;
	utm_source?: string;
	utm_medium?: string;
	utm_campaign?: string;
	utm_term?: string;
	utm_content?: string;
	load_time?: number;
	dom_ready_time?: number;
	ttfb?: number;
	connection_time?: number;
	request_time?: number;
	render_time?: number;
	fcp?: number;
	lcp?: number;
	cls?: number;
	properties: string;
	created_at: string;
}

export interface SanitizedError extends Record<string, unknown> {
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
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	country?: string;
	region?: string;
	created_at: string;
}

export interface SanitizedWebVitals extends Record<string, unknown> {
	id: string;
	client_id: string;
	event_id?: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
	path: string;
	fcp?: number;
	lcp?: number;
	cls?: number;
	fid?: number;
	inp?: number;
	browser_name?: string;
	browser_version?: string;
	os_name?: string;
	os_version?: string;
	device_type?: string;
	country?: string;
	region?: string;
	created_at: string;
}
