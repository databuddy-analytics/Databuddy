import { t } from "elysia";

export const MonitorStatus = {
	DOWN: 0,
	UP: 1,
	PENDING: 2,
	MAINTENANCE: 3,
} as const;

export const UptimeSchema = t.Object({
	site_id: t.String(),
	url: t.String(),
	timestamp: t.Number(),
	status: t.Number(),
	http_code: t.Number(),
	ttfb_ms: t.Number(),
	total_ms: t.Number(),
	attempt: t.Number(),
	retries: t.Number(),
	failure_streak: t.Number(),
	response_bytes: t.Number(),
	content_hash: t.String(),
	redirect_count: t.Number(),
	probe_region: t.String(),
	probe_ip: t.String(),
	ssl_expiry: t.Number(),
	ssl_valid: t.Number(),
	env: t.String(),
	check_type: t.String(),
	user_agent: t.String(),
	error: t.String(),
	json_data: t.Optional(t.String()),
});

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
