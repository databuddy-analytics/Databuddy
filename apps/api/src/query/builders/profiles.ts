import { Analytics } from '../../types/tables';
import type { Filter, SimpleQueryConfig } from '../types';
import { buildWhereClause } from '../utils';

export const ProfilesBuilders: Record<string, SimpleQueryConfig> = {
	profile_list: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: unknown[],
			_granularity?: unknown,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>
		) => {
			const combinedWhereClause = buildWhereClause(filterConditions);

			return {
				sql: `
    WITH visitor_profiles AS (
      SELECT
        anonymous_id as visitor_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        COUNT(DISTINCT session_id) as session_count,
        COUNT(*) as total_events,
        COUNT(DISTINCT path) as unique_pages,
        any(user_agent) as user_agent,
        any(country) as country,
        any(region) as region,
        any(device_type) as device_type,
        any(browser_name) as browser_name,
        any(os_name) as os_name,
        any(referrer) as referrer
      FROM analytics.events
      WHERE 
        client_id = {websiteId:String}
        AND time >= parseDateTimeBestEffort({startDate:String})
        AND time <= parseDateTimeBestEffort({endDate:String})
	${combinedWhereClause}
      GROUP BY anonymous_id
      ORDER BY last_visit DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    ),
    visitor_sessions AS (
      SELECT
        vp.visitor_id,
        e.session_id,
        MIN(e.time) as session_start,
        MAX(e.time) as session_end,
        LEAST(dateDiff('second', MIN(e.time), MAX(e.time)), 28800) as duration,
        COUNT(*) as page_views,
        COUNT(DISTINCT e.path) as unique_pages,
        any(e.user_agent) as user_agent,
        any(e.country) as country,
        any(e.region) as region,
        any(e.device_type) as device_type,
        any(e.browser_name) as browser_name,
        any(e.os_name) as os_name,
        any(e.referrer) as referrer,
        groupArray(
          tuple(
            e.id,
            e.time,
            e.event_name,
            e.path,
            CASE 
              WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out') 
                AND e.properties IS NOT NULL 
                AND e.properties != '{}' 
              THEN CAST(e.properties AS String)
              ELSE NULL
            END
          )
        ) as events
      FROM analytics.events e
      INNER JOIN visitor_profiles vp ON e.anonymous_id = vp.visitor_id
      WHERE e.client_id = {websiteId:String}
	${combinedWhereClause}
      GROUP BY vp.visitor_id, e.session_id
      ORDER BY vp.visitor_id, session_start DESC
    )
    SELECT
      vp.visitor_id,
      vp.first_visit,
      vp.last_visit,
      vp.session_count,
      vp.total_events,
      vp.unique_pages,
      vp.user_agent,
      vp.country,
      vp.region,
      vp.device_type,
      vp.browser_name,
      vp.os_name,
      vp.referrer,
      COALESCE(vs.session_id, '') as session_id,
      COALESCE(vs.session_start, '') as session_start,
      COALESCE(vs.session_end, '') as session_end,
      COALESCE(vs.duration, 0) as duration,
      COALESCE(vs.page_views, 0) as page_views,
      COALESCE(vs.unique_pages, 0) as session_unique_pages,
      COALESCE(vs.user_agent, '') as session_user_agent,
      COALESCE(vs.country, '') as session_country,
      COALESCE(vs.region, '') as session_region,
      COALESCE(vs.device_type, '') as session_device_type,
      COALESCE(vs.browser_name, '') as session_browser_name,
      COALESCE(vs.os_name, '') as session_os_name,
      COALESCE(vs.referrer, '') as session_referrer,
      COALESCE(vs.events, []) as events
    FROM visitor_profiles vp
    LEFT JOIN visitor_sessions vs ON vp.visitor_id = vs.visitor_id
    ORDER BY vp.last_visit DESC, vs.session_start DESC
  `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit: limit || 25,
					offset: offset || 0,
					...filterParams,
				},
			};
		},
	},

	profile_detail: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			filters?: Filter[],
			_granularity?: unknown,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			_filterConditions?: string[],
			_filterParams?: Record<string, Filter['value']>
		) => {
			const visitorId = filters?.find((f) => f.field === 'anonymous_id')?.value;

			if (!visitorId || typeof visitorId !== 'string') {
				throw new Error(
					'anonymous_id filter is required for profile_detail query'
				);
			}

			return {
				sql: `
    WITH user_profile AS (
      SELECT
        anonymous_id as visitor_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_pageviews,
        SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END) as total_duration,
        formatReadableTimeDelta(SUM(CASE WHEN time_on_page > 0 THEN time_on_page ELSE 0 END)) as total_duration_formatted,
        any(device_type) as device,
        any(browser_name) as browser,
        any(os_name) as os,
        any(country) as country,
        any(region) as region
      FROM analytics.events
      WHERE 
        client_id = {websiteId:String}
        AND anonymous_id = {visitorId:String}
        AND time >= parseDateTimeBestEffort({startDate:String})
        AND time <= parseDateTimeBestEffort({endDate:String})
      GROUP BY anonymous_id
    ),
    user_sessions AS (
      SELECT
        e.session_id,
        CONCAT('Session ', ROW_NUMBER() OVER (ORDER BY MIN(e.time))) as session_name,
        MIN(e.time) as first_visit,
        MAX(e.time) as last_visit,
        LEAST(dateDiff('second', MIN(e.time), MAX(e.time)), 28800) as duration,
        formatReadableTimeDelta(LEAST(dateDiff('second', MIN(e.time), MAX(e.time)), 28800)) as duration_formatted,
        COUNT(DISTINCT e.path) as page_views,
        COUNT(DISTINCT e.path) as unique_pages,
        any(e.device_type) as device,
        any(e.browser_name) as browser,
        any(e.os_name) as os,
        any(e.country) as country,
        any(e.region) as region,
        any(e.referrer) as referrer,
        groupArray(
          tuple(
            e.id,
            e.time,
            e.event_name,
            e.path,
            CASE 
              WHEN e.event_name NOT IN ('screen_view', 'page_exit', 'web_vitals', 'link_out') 
                AND e.properties IS NOT NULL 
                AND e.properties != '{}' 
              THEN CAST(e.properties AS String)
              ELSE NULL
            END,
            NULL,
            NULL
          )
        ) as events
      FROM analytics.events e
      WHERE 
        e.client_id = {websiteId:String}
        AND e.anonymous_id = {visitorId:String}
        AND e.time >= parseDateTimeBestEffort({startDate:String})
        AND e.time <= parseDateTimeBestEffort({endDate:String})
      GROUP BY e.session_id
      ORDER BY first_visit DESC
    )
    SELECT
      up.visitor_id,
      up.first_visit,
      up.last_visit,
      up.total_sessions,
      up.total_pageviews,
      up.total_duration,
      up.total_duration_formatted,
      up.device,
      up.browser,
      up.os,
      up.country,
      up.region,
      groupArray(
        tuple(
          us.session_id,
          us.session_name,
          us.first_visit,
          us.last_visit,
          us.duration,
          us.duration_formatted,
          us.page_views,
          us.unique_pages,
          us.device,
          us.browser,
          us.os,
          us.country,
          us.region,
          us.referrer,
          us.events
        )
      ) as sessions
    FROM user_profile up
    LEFT JOIN user_sessions us ON 1=1
    GROUP BY 
      up.visitor_id, up.first_visit, up.last_visit, up.total_sessions, 
      up.total_pageviews, up.total_duration, up.total_duration_formatted,
      up.device, up.browser, up.os, up.country, up.region
  `,
				params: {
					websiteId,
					visitorId,
					startDate,
					endDate: `${endDate} 23:59:59`,
				},
			};
		},
	},

	profile_metrics: {
		table: Analytics.events,
		fields: [
			'COUNT(DISTINCT anonymous_id) as total_visitors',
			'COUNT(DISTINCT session_id) as total_sessions',
			'AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END) as avg_session_duration',
			'COUNT(*) as total_events',
		],
		where: ["event_name = 'screen_view'"],
		timeField: 'time',
		customizable: true,
	},

	profile_duration_distribution: {
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
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
		],
		where: ["event_name = 'screen_view'", 'time_on_page > 0'],
		groupBy: ['duration_range'],
		orderBy: 'visitors DESC',
		timeField: 'time',
		customizable: true,
	},

	profiles_by_device: {
		table: Analytics.events,
		fields: [
			'device_type as name',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'", "device_type != ''"],
		groupBy: ['device_type'],
		orderBy: 'visitors DESC',
		timeField: 'time',
		customizable: true,
	},

	profiles_by_browser: {
		table: Analytics.events,
		fields: [
			'browser_name as name',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'", "browser_name != ''"],
		groupBy: ['browser_name'],
		orderBy: 'visitors DESC',
		limit: 100,
		timeField: 'time',

		customizable: true,
	},

	profiles_time_series: {
		table: Analytics.events,
		fields: [
			'toDate(time) as date',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_session_duration',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: ['toDate(time)'],
		orderBy: 'date ASC',
		timeField: 'time',

		customizable: true,
	},

	returning_visitors: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: unknown[],
			_granularity?: unknown,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>
		) => {
			const combinedWhereClause = buildWhereClause(filterConditions);

			return {
				sql: `
      SELECT
        anonymous_id as visitor_id,
        COUNT(DISTINCT session_id) as session_count,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        COUNT(DISTINCT path) as unique_pages
      FROM analytics.events
      WHERE 
        client_id = {websiteId:String}
        AND time >= parseDateTimeBestEffort({startDate:String})
        AND time <= parseDateTimeBestEffort({endDate:String})
        AND event_name = 'screen_view'
	${combinedWhereClause}
      GROUP BY anonymous_id
      HAVING session_count > 1
      ORDER BY session_count DESC
      LIMIT {limit:Int32} OFFSET {offset:Int32}
    `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					limit: limit || 100,
					offset: offset || 0,
					...filterParams,
				},
			};
		},
	},
};
