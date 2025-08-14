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
        ) => {
            const allowed = new Set([
                'path',
                'referrer',
                'device_type',
                'browser_name',
                'os_name',
                'country',
            ]);
            const filters = Array.isArray(_filters) ? (_filters as any[]) : [];
            const eventLevelClauses: string[] = [];
            const sessionLevelClauses: string[] = [];
            const params: Record<string, unknown> = {
                websiteId,
                startDate,
                endDate: `${endDate} 23:59:59`,
                limit: limit ?? 25,
                offset: offset ?? 0,
            };
            let idx = 0;
            
            for (const f of filters) {
                if (!f || !allowed.has(f.field)) continue;
                const op = (f as any).op || (f as any).operator;
                
                // Path filters need to be applied at event level before grouping
                if (f.field === 'path') {
                    const key = `sf${idx++}`;
                    if (op === 'like') {
                        eventLevelClauses.push(`path LIKE {${key}:String}`);
                        (params as any)[key] = `%${(f as any).value}%`;
                    } else {
                        eventLevelClauses.push(`path = {${key}:String}`);
                        (params as any)[key] = String((f as any).value);
                    }
                } else {
                    // Other filters can be applied at session level after grouping
                    if (op === 'like') {
                        const key = `sf${idx++}`;
                        if (f.field === 'referrer') {
                            sessionLevelClauses.push(`lower(referrer) LIKE lower({${key}:String})`);
                            (params as any)[key] = `%${(f as any).value}%`;
                        } else {
                            sessionLevelClauses.push(`${f.field} LIKE {${key}:String}`);
                            (params as any)[key] = `%${(f as any).value}%`;
                        }
                    } else {
                        if (f.field === 'referrer' && (f as any).value === '') {
                            sessionLevelClauses.push(`(referrer = '' OR referrer IS NULL OR referrer = 'direct')`);
                        } else {
                            const key = `sf${idx++}`;
                            sessionLevelClauses.push(`${f.field} = {${key}:String}`);
                            (params as any)[key] = Array.isArray((f as any).value)
                                ? String((f as any).value[0])
                                : String((f as any).value);
                        }
                    }
                }
            }
            
            const eventWhereFilters = eventLevelClauses.length ? ` AND ${eventLevelClauses.join(' AND ')}` : '';
            const sessionHavingFilters = sessionLevelClauses.length ? ` HAVING ${sessionLevelClauses.join(' AND ')}` : '';

            return {
                sql: `
    WITH session_list AS (
      SELECT
        session_id,
        MIN(time) as first_visit,
        MAX(time) as last_visit,
        LEAST(dateDiff('second', MIN(time), MAX(time)), 28800) as duration,
        countIf(event_name = 'screen_view') as page_views,
        argMin(anonymous_id, time) as visitor_id,
        argMin(user_agent, time) as user_agent,
        argMin(country, time) as country,
        argMin(referrer, time) as referrer,
        argMin(device_type, time) as device_type,
        argMin(browser_name, time) as browser_name,
        argMin(os_name, time) as os_name
      FROM analytics.events
      WHERE 
        client_id = {websiteId:String}
        AND time >= parseDateTimeBestEffort({startDate:String})
        AND time <= parseDateTimeBestEffort({endDate:String})
        ${eventWhereFilters}
      GROUP BY session_id
      ${sessionHavingFilters}
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
                params,
            };
        },
		timeField: 'time',
			allowedFilters: [
				'path',
				'referrer',
				'device_type',
				'browser_name',
				'os_name',
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
