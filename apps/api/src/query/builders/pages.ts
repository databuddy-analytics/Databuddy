import { Analytics } from '../../types/tables';
import type { SimpleQueryConfig } from '../types';

export const PagesBuilders: Record<string, SimpleQueryConfig> = {
	top_pages: {
		table: Analytics.events,
		fields: [
			"trimRight(path(path), '/') as name",
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ["trimRight(path(path), '/')"],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['referrer', 'device_type', 'browser_name'],
		customizable: true,
	},

	entry_pages: {
		table: Analytics.events,
		fields: [
			'entry_page as name',
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ['entry_page'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['referrer', 'device_type'],
		customizable: true,
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
            WITH session_entry AS (
                SELECT 
                    session_id,
                    anonymous_id,
                    trimRight(path(path), '/') as entry_page,
                    time as entry_time,
                    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY time) as page_rank
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort({endDate:String})
                    AND event_name = 'screen_view'
                    AND path != ''
            )
            SELECT 
                entry_page as name,
                COUNT(*) as pageviews,
                COUNT(DISTINCT anonymous_id) as visitors,
                ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
            FROM session_entry
            WHERE page_rank = 1
            GROUP BY entry_page
            ORDER BY pageviews DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}
            `,
			params: {
				websiteId,
				startDate,
				endDate,
				limit: limit || 100,
				offset: offset || 0,
			},
		}),
	},

	exit_pages: {
		table: Analytics.events,
		fields: [
			'path as name',
			'COUNT(DISTINCT session_id) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(DISTINCT session_id) / SUM(COUNT(DISTINCT session_id)) OVER()) * 100, 2) as percentage',
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ['path'],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['referrer', 'device_type'],
		customizable: true,
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
            WITH sessions AS (
                SELECT
                    session_id,
                    MAX(time) as session_end_time
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort({endDate:String})
                    AND event_name = 'screen_view'
                    AND path != ''
                GROUP BY session_id
            ),
            exit_pages AS (
                SELECT
                    trimRight(path(e.path), '/') as path,
                    e.session_id,
                    e.anonymous_id
                FROM analytics.events e
                INNER JOIN sessions s ON e.session_id = s.session_id AND e.time = s.session_end_time
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.event_name = 'screen_view'
                    AND e.path != ''
            )
            SELECT 
                path as name,
                COUNT(DISTINCT session_id) as pageviews,
                COUNT(DISTINCT anonymous_id) as visitors,
                ROUND((COUNT(DISTINCT session_id) / SUM(COUNT(DISTINCT session_id)) OVER()) * 100, 2) as percentage
            FROM exit_pages
            GROUP BY path
            ORDER BY pageviews DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}
            `,
			params: {
				websiteId,
				startDate,
				endDate,
				limit: limit || 100,
				offset: offset || 0,
			},
		}),
	},

	page_performance: {
		table: Analytics.events,
		fields: [
			"trimRight(path(path), '/') as name",
			'COUNT(*) as pageviews',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_time_on_page',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["event_name = 'screen_view'", "path != ''"],
		groupBy: ["trimRight(path(path), '/')"],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: ['referrer', 'device_type'],
		customizable: true,
	},
};
