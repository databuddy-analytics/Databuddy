import type { SimpleQueryConfig } from '../types';

export const CustomEventsBuilders: Record<string, SimpleQueryConfig> = {
	custom_events: {
		table: 'analytics.events',
		fields: [
			'event_name as name',
			'COUNT(*) as total_events',
			'COUNT(DISTINCT anonymous_id) as unique_users',
			'COUNT(DISTINCT session_id) as unique_sessions',
			'MAX(time) as last_occurrence',
			'MIN(time) as first_occurrence',
			'COUNT(DISTINCT path) as unique_pages',
			"countIf(properties != '{}' AND isValidJSON(properties)) as events_with_properties",
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: [
			"event_name NOT IN ('screen_view', 'page_exit', 'error', 'web_vitals', 'link_out')",
			"event_name != ''",
		],
		groupBy: ['event_name'],
		orderBy: 'total_events DESC',
		limit: 10_000,
		timeField: 'time',
		allowedFilters: ['event_name', 'path', 'device_type', 'browser_name'],
		customizable: true,
	},
	custom_event_properties: {
		table: 'analytics.events',
		fields: [
			'event_name as name',
			'arrayJoin(JSONExtractKeys(properties)) as property_key',
			'JSONExtractRaw(properties, property_key) as property_value',
			'COUNT(*) as count',
		],
		where: [
			"event_name NOT IN ('screen_view', 'page_exit', 'error', 'web_vitals', 'link_out')",
			"event_name != ''",
			"properties != '{}'",
			'isValidJSON(properties)',
		],
		groupBy: ['event_name', 'property_key', 'property_value'],
		orderBy: 'count DESC',
		limit: 10_000,
		timeField: 'time',
		allowedFilters: ['event_name', 'path', 'device_type', 'browser_name'],
		customizable: true,
	},
};
