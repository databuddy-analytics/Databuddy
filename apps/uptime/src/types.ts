export interface UptimeData {
	site_id: string;
	url: string;
	timestamp: number;
	status: number;
	http_code: number;
	ttfb_ms: number;
	total_ms: number;
	attempt: number;
	retries: number;
	failure_streak: number;
	response_bytes: number;
	content_hash: string;
	redirect_count: number;
	probe_region: string;
	probe_ip: string;
	ssl_expiry: number;
	ssl_valid: number;
	env: string;
	check_type: string;
	user_agent: string;
	error: string;
	json_data?: string;
	alarm_id?: string;
	notification_channels?: string[];
}