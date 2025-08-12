import { Analytics } from '../../types/tables';
import type { Filter, SimpleQueryConfig } from '../types';
import { buildWhereClause } from '../utils';

export const PagesBuilders: Record<string, SimpleQueryConfig> = {
	top_pages: {
		table: Analytics.events,
		fields: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as name",
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END",
		],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
		meta: {
			title: 'Top Pages',
			description:
				'Most visited pages on your website, ranked by total pageviews with visitor counts and traffic percentage.',
			category: 'Content',
			tags: ['pages', 'content', 'traffic'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Page Path',
					description: 'The URL path of the page',
					example: '/home',
				},
				{
					name: 'pageviews',
					type: 'number',
					label: 'Pageviews',
					description: 'Total number of page views',
					example: 1234,
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Unique Visitors',
					description: 'Number of unique visitors',
					example: 456,
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Traffic %',
					description: 'Percentage of total traffic',
					unit: '%',
					example: 12.5,
				},
			],
			output_example: [
				{ name: '/home', pageviews: 1234, visitors: 456, percentage: 12.5 },
				{ name: '/about', pageviews: 987, visitors: 321, percentage: 10.2 },
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
	},

	entry_pages: {
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
            WITH session_entry AS (
                SELECT 
                    session_id,
                    anonymous_id,
                    CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as entry_page,
                    time as entry_time,
                    ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY time) as page_rank
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort({endDate:String})
                    AND event_name = 'screen_view'
                    ${combinedWhereClause}
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
					...filterParams,
				},
			};
		},
	},

	exit_pages: {
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
            WITH sessions AS (
                SELECT
                    session_id,
                    MAX(time) as session_end_time
                FROM analytics.events
                WHERE client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort({endDate:String})
                    AND event_name = 'screen_view'
					${combinedWhereClause}
                GROUP BY session_id
            ),
            exit_pages AS (
                SELECT
                    CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END as path,
                    e.session_id,
                    e.anonymous_id
                FROM analytics.events e
                INNER JOIN sessions s ON e.session_id = s.session_id AND e.time = s.session_end_time
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.event_name = 'screen_view'
					${combinedWhereClause}
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
					...filterParams,
				},
			};
		},
	},

	page_performance: {
		table: Analytics.events,
		fields: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as name",
			'COUNT(*) as pageviews',
			'ROUND(AVG(CASE WHEN time_on_page > 0 THEN time_on_page / 1000 ELSE NULL END), 2) as avg_time_on_page',
			'COUNT(DISTINCT anonymous_id) as visitors',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END",
		],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		customizable: true,
	},
};
