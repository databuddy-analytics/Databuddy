export const MonitorStatus = {
	DOWN: 0,
	UP: 1,
	PENDING: 2,
	MAINTENANCE: 3,
} as const;

export interface UptimeData {
	attempt: number;
	check_type: string;
	content_hash: string;
	env: string;
	error: string;
	failure_streak: number;
	http_code: number;
	json_data?: string;
	probe_ip: string;
	probe_region: string;
	redirect_count: number;
	response_bytes: number;
	retries: number;
	site_id: string;
	ssl_expiry: number;
	ssl_valid: number;
	status: number;
	timestamp: number;
	total_ms: number;
	ttfb_ms: number;
	url: string;
	user_agent: string;
}

export type ActionResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };
