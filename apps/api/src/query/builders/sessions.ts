import { Analytics } from '../../types/tables';
import type { SimpleQueryConfig } from '../types';

export const SessionsBuilders: Record<string, SimpleQueryConfig> = {
	session_metrics: {
		table: Analytics.events,
		fields: [
			'COUNT(DISTINCT session_id) as total_sessions',
			'AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END) as avg_session_duration',
			'AVG(CASE WHEN is_bounce = 1 THEN 100 ELSE 0 END) as bounce_rate',
			'COUNT(*) as total_events',
		],
		where: ["event_name = 'screen_view'"],
		timeField: 'time',
		allowedFilters: [
			'path',
			'referrer',
			'device_type',
			'browser_name',
			'country',
		],
		customizable: true,
	},

	session_duration_distribution: {
		table: Analytics.events,
		fields: [
			'CASE ' +
				"WHEN time_on_page < 30 THEN '0-30s' " +
				"WHEN time_on_page < 60 THEN '30s-1m' " +
				"WHEN time_on_page < 300 THEN '1m-5m' " +
				"WHEN time_on_page < 900 THEN '5m-15m' " +
				"WHEN time_on_page < 3600 THEN '15m-1h' " +
				"ELSE '1h+' " +
				'END as duration_range',
			'COUNT(DISTINCT session_id) as sessions',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["event_name = 'screen_view'", 'time_on_page > 0'],
		groupBy: ['duration_range'],
		orderBy: 'sessions DESC',
		timeField: 'time',
		allowedFilters: ['path', 'referrer', 'device_type'],
		customizable: true,
	},

	sessions_by_device: {
		table: Analytics.events,
		fields: [
			'device_type as name',
			'COUNT(DISTINCT session_id) as sessions',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'", "device_type != ''"],
		groupBy: ['device_type'],
		orderBy: 'sessions DESC',
		timeField: 'time',
		allowedFilters: ['device_type', 'path', 'referrer'],
		customizable: true,
	},

	sessions_by_browser: {
		table: Analytics.events,
		fields: [
			'browser_name as name',
			'COUNT(DISTINCT session_id) as sessions',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'", "browser_name != ''"],
		groupBy: ['browser_name'],
		orderBy: 'sessions DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['browser_name', 'path', 'device_type'],
		customizable: true,
	},

	sessions_time_series: {
		table: Analytics.events,
		fields: [
			'toDate(time) as date',
			'COUNT(DISTINCT session_id) as sessions',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: ['toDate(time)'],
		orderBy: 'date ASC',
		timeField: 'time',
		allowedFilters: ['path', 'referrer', 'device_type'],
		customizable: true,
	},

	session_flow: {
		table: Analytics.events,
		fields: [
			'path as name',
			'COUNT(DISTINCT session_id) as sessions',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ['path'],
		orderBy: 'sessions DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['path', 'referrer', 'device_type'],
		customizable: true,
	},

	session_list: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: unknown[],
			_granularity?: unknown,
			limit?: number,
			offset?: number
		) => ({
			sql: `
    WITH session_list AS (
      SELECT
        session_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        LEAST(dateDiff('second', MIN(time), MAX(time)), 28800) as duration,
        countIf(event_name = 'screen_view') as page_views,
        any(anonymous_id) as visitor_id,
        any(user_agent) as user_agent,
        any(country) as country,
        any(referrer) as referrer,
        any(device_type) as device_type,
        any(browser_name) as browser_name,
        any(os_name) as os_name
      FROM analytics.events
      WHERE 
        client_id = {websiteId:String}
        AND time >= parseDateTimeBestEffort({startDate:String})
        AND time <= parseDateTimeBestEffort({endDate:String})
      GROUP BY session_id
      ORDER BY first_visit DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    session_events AS (
      SELECT
        e.session_id,
        groupArray(
          tuple(
            e.id,
            e.time,
            e.event_name,
            e.path,
            e.error_message,
            e.error_type,
            CASE 
              WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'error', 'web_vitals', 'link_out') 
                AND e.properties IS NOT NULL 
                AND e.properties != '{}' 
              THEN CAST(e.properties AS String)
              ELSE NULL
            END
          )
        ) as events
      FROM analytics.events e
      INNER JOIN session_list sl ON e.session_id = sl.session_id
      WHERE e.client_id = {websiteId:String}
      GROUP BY e.session_id
    )
    SELECT
      sl.session_id,
      sl.first_visit,
      sl.last_visit,
      sl.duration,
      sl.page_views,
      sl.visitor_id,
      sl.user_agent,
      sl.country,
      sl.referrer,
      sl.device_type,
      sl.browser_name,
      sl.os_name,
      COALESCE(se.events, []) as events
    FROM session_list sl
    LEFT JOIN session_events se ON sl.session_id = se.session_id
    ORDER BY sl.first_visit DESC
  `,
			params: {
				websiteId,
				startDate,
				endDate: `${endDate} 23:59:59`,
				limit: limit || 25,
				offset: offset || 0,
			},
		}),
		timeField: 'time',
		allowedFilters: [
			'path',
			'referrer',
			'device_type',
			'browser_name',
			'country',
		],
		customizable: true,
	},

	session_events: {
		table: Analytics.events,
		fields: [
			'session_id',
			'event_id',
			'time',
			'event_name',
			'path',
			'error_message',
			'error_type',
			'properties',
			'device_type',
			'browser_name',
			'country',
			'user_agent',
		],
		where: ['session_id = ?'],
		orderBy: 'time ASC',
		timeField: 'time',
		allowedFilters: ['event_name', 'path', 'error_type'],
		customizable: true,
	},
};
