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
			"countIf(properties != '' AND isValidJSON(properties)) as events_with_properties",
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
			"arrayDistinct(groupArray(CASE WHEN isValidJSON(properties) AND properties != '' THEN properties ELSE NULL END)) as all_properties",
		],
		where: [
			"event_name NOT IN ('screen_view', 'page_exit', 'error', 'web_vitals', 'link_out')",
			"event_name != ''",
		],
		groupBy: ['event_name'],
		orderBy: 'total_events DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['event_name', 'path', 'device_type', 'browser_name'],
		customizable: true,
	},
};
