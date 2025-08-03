// Metrics and data types for analytics

// Base interface for common metric structure
export interface BaseMetricData {
	name: string;
	visitors: number;
	pageviews: number;
}

export interface DeviceTypeMetricData extends BaseMetricData {}

export interface BrowserMetricData extends BaseMetricData {}

export interface CountryMetricData extends BaseMetricData {}

export interface RegionMetricData extends BaseMetricData {}

export interface PageMetricData extends BaseMetricData {}

export interface ReferrerMetricData extends BaseMetricData {}

export interface PerformanceMetricData extends BaseMetricData {
	sessions: number;
	avg_load_time: number;
	avg_ttfb?: number;
	avg_dom_ready_time?: number;
	avg_render_time?: number;
}

export interface TimezoneData {
	name: string;
	code?: string;
	current_time?: string;
	visitors: number;
	pageviews: number;
}

export interface LanguageData {
	name: string;
	code?: string;
	visitors: number;
	pageviews: number;
}

export interface UTMData {
	name: string;
	visitors: number;
	pageviews: number;
}

export interface CustomEventData {
	name: string;
	total_events: number;
	unique_users: number;
	unique_sessions: number;
	last_occurrence: string;
	first_occurrence: string;
	unique_pages: number;
}
