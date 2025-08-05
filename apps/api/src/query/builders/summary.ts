import { Analytics } from '../../types/tables';
import type { Filter, SimpleQueryConfig, TimeUnit } from '../types';

export const SummaryBuilders: Record<string, SimpleQueryConfig> = {
	summary_metrics: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			timezone?: string
		) => {
			const tz = timezone || 'UTC';
			return {
				sql: `
            WITH base_events AS (
              SELECT
                session_id,
                anonymous_id,
                event_name,
                toTimeZone(time, {timezone:String}) as normalized_time
              FROM analytics.events
              WHERE 
                client_id = {websiteId:String}
                AND time >= parseDateTimeBestEffort({startDate:String})
                AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                AND session_id != ''
            ),
            session_metrics AS (
              SELECT
                session_id,
                countIf(event_name = 'screen_view') as page_count
              FROM base_events
              GROUP BY session_id
            ),
            session_durations AS (
              SELECT
                session_id,
                dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
              FROM base_events
              GROUP BY session_id
              HAVING duration >= 0
            ),
            unique_visitors AS (
              SELECT
                countDistinct(anonymous_id) as unique_visitors
              FROM base_events
              WHERE event_name = 'screen_view'
            ),
            all_events AS (
              SELECT
                count() as total_events,
                countIf(event_name = 'screen_view') as total_screen_views
              FROM base_events
            ),
            bounce_sessions AS (
              SELECT
                countIf(page_count = 1) as bounced_sessions,
                count() as total_sessions
              FROM session_metrics
            )
            SELECT
              sum(page_count) as pageviews,
              (SELECT unique_visitors FROM unique_visitors) as unique_visitors,
              (SELECT total_sessions FROM bounce_sessions) as sessions,
              ROUND(CASE 
                WHEN (SELECT total_sessions FROM bounce_sessions) > 0 
                THEN ((SELECT bounced_sessions FROM bounce_sessions) / (SELECT total_sessions FROM bounce_sessions)) * 100 
                ELSE 0 
              END, 2) as bounce_rate,
              ROUND(median(sd.duration), 2) as avg_session_duration,
              (SELECT total_events FROM all_events) as total_events
            FROM session_metrics
            LEFT JOIN session_durations as sd ON session_metrics.session_id = sd.session_id
        `,
				params: {
					websiteId,
					startDate,
					endDate,
					timezone: tz,
				},
			};
		},
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

	today_metrics: {
		table: Analytics.events,
		fields: [
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'COUNT(DISTINCT session_id) as sessions',
			'ROUND(AVG(CASE WHEN is_bounce = 1 THEN 100 ELSE 0 END), 2) as bounce_rate',
		],
		where: ["event_name = 'screen_view'", 'toDate(time) = today()'],
		timeField: 'time',
		allowedFilters: ['path', 'referrer', 'device_type'],
		customizable: true,
	},

	events_by_date: {
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: unknown[],
			_granularity?: unknown,
			_limit?: number,
			_offset?: number,
			timezone?: string
		) => {
			const tz = timezone || 'UTC';
			const isHourly = _granularity === 'hour' || _granularity === 'hourly';

			if (isHourly) {
				return {
					sql: `
                WITH base_events AS (
                  SELECT
                    session_id,
                    anonymous_id,
                    event_name,
                    toTimeZone(time, {timezone:String}) as normalized_time
                  FROM analytics.events
                  WHERE 
                    client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND session_id != ''
                ),
                hour_range AS (
                  SELECT arrayJoin(arrayMap(
                    h -> toStartOfHour(toTimeZone(toDateTime(concat({startDate:String}, ' 00:00:00')) + (h * 3600), {timezone:String})),
                    range(toUInt32(dateDiff('hour', toDateTime(concat({startDate:String}, ' 00:00:00')), toDateTime(concat({endDate:String}, ' 23:59:59'))) + 1))
                  )) AS datetime
                ),
                session_details AS (
                  SELECT
                    session_id,
                    toStartOfHour(MIN(normalized_time)) as session_start_hour,
                    countIf(event_name = 'screen_view') as page_count,
                    dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
                  FROM base_events
                  GROUP BY session_id
                ),
                hourly_session_metrics AS (
                  SELECT
                    session_start_hour as event_hour,
                    count(session_id) as sessions,
                    countIf(page_count = 1) as bounced_sessions,
                    medianIf(duration, duration >= 0) as median_session_duration
                  FROM session_details
                  GROUP BY session_start_hour
                ),
                hourly_event_metrics AS (
                  SELECT
                    toStartOfHour(normalized_time) as event_hour,
                    countIf(event_name = 'screen_view') as pageviews,
                    count(distinct anonymous_id) as unique_visitors
                  FROM base_events
                  GROUP BY event_hour
                )
                SELECT
                  formatDateTime(hr.datetime, '%Y-%m-%d %H:00:00') as date,
                  COALESCE(hem.pageviews, 0) as pageviews,
                  COALESCE(hem.unique_visitors, 0) as visitors,
                  COALESCE(hsm.sessions, 0) as sessions,
                  ROUND(CASE 
                    WHEN COALESCE(hsm.sessions, 0) > 0 
                    THEN (COALESCE(hsm.bounced_sessions, 0) / hsm.sessions) * 100 
                    ELSE 0 
                  END, 2) as bounce_rate,
                  ROUND(COALESCE(hsm.median_session_duration, 0), 2) as avg_session_duration,
                  ROUND(CASE 
                    WHEN COALESCE(hsm.sessions, 0) > 0 
                    THEN COALESCE(hem.pageviews, 0) / COALESCE(hsm.sessions, 0) 
                    ELSE 0 
                  END, 2) as pages_per_session
                FROM hour_range hr
                LEFT JOIN hourly_session_metrics hsm ON hr.datetime = hsm.event_hour
                LEFT JOIN hourly_event_metrics hem ON hr.datetime = hem.event_hour
                ORDER BY hr.datetime ASC
            `,
					params: {
						websiteId,
						startDate,
						endDate,
						timezone: tz,
					},
				};
			}

			return {
				sql: `
                WITH base_events AS (
                  SELECT
                    session_id,
                    anonymous_id,
                    event_name,
                    toTimeZone(time, {timezone:String}) as normalized_time
                  FROM analytics.events
                  WHERE
                    client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
                    AND session_id != ''
                ),
                date_range AS (
                  SELECT arrayJoin(arrayMap(
                    d -> toDate({startDate:String}) + d,
                    range(toUInt32(dateDiff('day', toDate({startDate:String}), toDate({endDate:String})) + 1))
                  )) AS date
                ),
                session_details AS (
                  SELECT
                    session_id,
                    toDate(MIN(normalized_time)) as session_start_date,
                    countIf(event_name = 'screen_view') as page_count,
                    dateDiff('second', MIN(normalized_time), MAX(normalized_time)) as duration
                  FROM base_events
                  GROUP BY session_id
                ),
                daily_session_metrics AS (
                  SELECT
                    session_start_date,
                    count(session_id) as sessions,
                    countIf(page_count = 1) as bounced_sessions,
                    medianIf(duration, duration >= 0) as median_session_duration
                  FROM session_details
                  GROUP BY session_start_date
                ),
                daily_event_metrics AS (
                  SELECT
                    toDate(normalized_time) as event_date,
                    countIf(event_name = 'screen_view') as pageviews,
                    count(distinct anonymous_id) as unique_visitors
                  FROM base_events
                  GROUP BY event_date
                )
                SELECT
                  dr.date,
                  COALESCE(dem.pageviews, 0) as pageviews,
                  COALESCE(dem.unique_visitors, 0) as visitors,
                  COALESCE(dsm.sessions, 0) as sessions,
                  ROUND(CASE 
                    WHEN COALESCE(dsm.sessions, 0) > 0 
                    THEN (COALESCE(dsm.bounced_sessions, 0) / dsm.sessions) * 100 
                    ELSE 0 
                  END, 2) as bounce_rate,
                  ROUND(COALESCE(dsm.median_session_duration, 0), 2) as avg_session_duration,
                  ROUND(CASE 
                    WHEN COALESCE(dsm.sessions, 0) > 0 
                    THEN COALESCE(dem.pageviews, 0) / COALESCE(dsm.sessions, 0) 
                    ELSE 0 
                  END, 2) as pages_per_session
                FROM date_range dr
                LEFT JOIN daily_session_metrics dsm ON dr.date = dsm.session_start_date
                LEFT JOIN daily_event_metrics dem ON dr.date = dem.event_date
                ORDER BY dr.date ASC
            `,
				params: {
					websiteId,
					startDate,
					endDate,
					timezone: tz,
				},
			};
		},
		timeField: 'time',
		allowedFilters: ['path', 'referrer', 'device_type'],
		customizable: true,
	},

	active_stats: {
		customSql: (websiteId: string) => {
			return {
				sql: `
          SELECT
            COUNT(DISTINCT anonymous_id) as active_users,
            COUNT(DISTINCT session_id) as active_sessions
          FROM analytics.events
          WHERE event_name = 'screen_view'
            AND client_id = {websiteId:String}
            AND session_id != ''
            AND time >= now() - INTERVAL 5 MINUTE
        `,
				params: {
					websiteId,
				},
			};
		},
		timeField: 'time',
		allowedFilters: ['path', 'referrer'],
		customizable: true,
		appendEndOfDayToTo: false,
	},
};
