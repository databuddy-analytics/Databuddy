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
});

export type UptimeData = {
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
};

export type ActionResult<T> =
	| { success: true; data: T }
	| { success: false; error: string };
