export type WebVitalMetricName = "FCP" | "LCP" | "CLS" | "INP" | "TTFB" | "FPS";

export interface BlockedTraffic {
	accept_header?: string;
	block_category: string;
	block_reason: string;
	bot_name?: string;
	browser_name?: string;
	browser_version?: string;
	city?: string;
	client_id?: string;
	country?: string;
	created_at: number;
	device_type?: string;
	id: string;
	ip: string;
	language?: string;
	method: string;
	origin?: string;
	os_name?: string;
	os_version?: string;
	path?: string;
	payload_size?: number;
	referrer?: string;
	region?: string;
	timestamp: number;
	url?: string;
	user_agent?: string;
}
