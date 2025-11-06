import { QueryBuilders } from "./builders";

export const ALL_QUERY_TYPES = Object.keys(QueryBuilders) as Array<
	keyof typeof QueryBuilders
>;

export const QUERY_CATEGORIES = {
	summary: {
		name: "Summary",
		description: "High-level analytics overview and today's data",
		queries: ["summary", "today_summary", "today_by_hour"] as const,
	},
	pages: {
		name: "Pages",
		description: "Page view analytics and performance",
		queries: [
			"top_pages",
			"page_details",
			"entry_pages",
			"exit_pages",
			"page_time_series",
		] as const,
	},
	traffic: {
		name: "Traffic Sources",
		description: "Referrer and UTM campaign analysis",
		queries: [
			"top_referrers",
			"utm_sources",
			"utm_mediums",
			"utm_campaigns",
			"referrer_types",
			"referrer_domains",
		] as const,
	},
	devices: {
		name: "Devices & Browsers",
		description: "Device type, browser, and OS analytics",
		queries: [
			"device_types",
			"browsers",
			"browser_versions",
			"operating_systems",
			"os_versions",
			"screen_resolutions",
		] as const,
	},
	geo: {
		name: "Geographic",
		description: "Geographic location analytics",
		queries: ["countries", "cities", "regions", "geo_time_series"] as const,
	},
	errors: {
		name: "Error Tracking",
		description: "Error monitoring and analysis",
		queries: [
			"recent_errors",
			"error_types",
			"error_trends",
			"errors_by_page",
			"error_frequency",
		] as const,
	},
	performance: {
		name: "Performance",
		description: "Page load time and performance metrics",
		queries: [
			"performance_metrics",
			"slow_pages",
			"performance_by_device",
			"performance_by_browser",
			"performance_time_series",
		] as const,
	},
	sessions: {
		name: "Sessions",
		description: "Session analytics and user behavior",
		queries: [
			"session_metrics",
			"session_duration_distribution",
			"sessions_by_device",
			"sessions_by_browser",
			"sessions_time_series",
			"session_flow",
		] as const,
	},
	custom_events: {
		name: "Custom Events",
		description: "Custom event tracking and analysis",
		queries: [
			"custom_events",
			"custom_event_details",
			"custom_event_trends",
			"custom_event_by_page",
		] as const,
	},
} as const;

export const COMMON_FILTERS = {
	path: {
		name: "Page Path",
		description: "Filter by specific page paths",
		type: "string",
	},
	referrer: {
		name: "Referrer",
		description: "Filter by referring websites",
		type: "string",
	},
	device_type: {
		name: "Device Type",
		description: "Filter by device type (mobile, desktop, tablet)",
		type: "string",
	},
	browser_name: {
		name: "Browser",
		description: "Filter by browser name",
		type: "string",
	},
	browser_version: {
		name: "Browser Version",
		description: "Filter by browser version",
		type: "string",
	},
	os_name: {
		name: "Operating System",
		description: "Filter by operating system",
		type: "string",
	},
	os_version: {
		name: "OS Version",
		description: "Filter by operating system version",
		type: "string",
	},
	country: {
		name: "Country",
		description: "Filter by country",
		type: "string",
	},
	city: {
		name: "City",
		description: "Filter by city",
		type: "string",
	},
	region: {
		name: "Region",
		description: "Filter by region/state",
		type: "string",
	},
	utm_source: {
		name: "UTM Source",
		description: "Filter by UTM source parameter",
		type: "string",
	},
	utm_medium: {
		name: "UTM Medium",
		description: "Filter by UTM medium parameter",
		type: "string",
	},
	utm_campaign: {
		name: "UTM Campaign",
		description: "Filter by UTM campaign parameter",
		type: "string",
	},
	event_name: {
		name: "Event Name",
		description: "Filter by custom event name",
		type: "string",
	},
	message: {
		name: "Error Message",
		description: "Filter by error message content",
		type: "string",
	},
} as const;

export const TIME_RANGES = {
	today: {
		name: "Today",
		description: "Data from today only",
		value: "today",
	},
	yesterday: {
		name: "Yesterday",
		description: "Data from yesterday",
		value: "yesterday",
	},
	last_7_days: {
		name: "Last 7 Days",
		description: "Data from the last 7 days",
		value: "last_7_days",
	},
	last_30_days: {
		name: "Last 30 Days",
		description: "Data from the last 30 days",
		value: "last_30_days",
	},
	last_90_days: {
		name: "Last 90 Days",
		description: "Data from the last 90 days",
		value: "last_90_days",
	},
	custom: {
		name: "Custom Range",
		description: "Custom date range",
		value: "custom",
	},
} as const;

export const getQueriesByCategory = (category: keyof typeof QUERY_CATEGORIES) =>
	QUERY_CATEGORIES[category].queries;

export const getQueryCategory = (queryType: keyof typeof QueryBuilders) => {
	for (const [category, config] of Object.entries(QUERY_CATEGORIES)) {
		if ((config.queries as readonly string[]).includes(queryType as string)) {
			return category as keyof typeof QUERY_CATEGORIES;
		}
	}
	return null;
};

export const getAvailableFilters = (queryType: keyof typeof QueryBuilders) => {
	const config = QueryBuilders[queryType];
	return config?.allowedFilters || [];
};

export const isQueryCustomizable = (queryType: keyof typeof QueryBuilders) => {
	const config = QueryBuilders[queryType];
	return config?.customizable;
};

export type QueryCategory = keyof typeof QUERY_CATEGORIES;
export type CommonFilter = keyof typeof COMMON_FILTERS;
export type TimeRange = keyof typeof TIME_RANGES;
