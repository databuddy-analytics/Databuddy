// Metrics and data types for analytics

// Base interface for common metric structure
export interface BaseMetricData {
	name: string;
	pageviews: number;
	visitors: number;
}

export interface DeviceTypeMetricData extends BaseMetricData {}

export interface BrowserMetricData extends BaseMetricData {}

export interface CountryMetricData extends BaseMetricData {}

export interface RegionMetricData extends BaseMetricData {}

export interface PageMetricData extends BaseMetricData {}

export interface ReferrerMetricData extends BaseMetricData {}

export interface PerformanceMetricData extends BaseMetricData {
	avg_dom_ready_time?: number;
	avg_load_time: number;
	avg_render_time?: number;
	avg_ttfb?: number;
	sessions: number;
}

export interface TimezoneData {
	code?: string;
	current_time?: string;
	name: string;
	pageviews: number;
	visitors: number;
}

export interface LanguageData {
	code?: string;
	name: string;
	pageviews: number;
	visitors: number;
}

export interface UTMData {
	name: string;
	pageviews: number;
	visitors: number;
}

export interface CustomEventData {
	first_occurrence: string;
	last_occurrence: string;
	name: string;
	total_events: number;
	unique_pages: number;
	unique_sessions: number;
	unique_users: number;
}
