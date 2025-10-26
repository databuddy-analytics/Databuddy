import { Analytics } from '../../types/tables';
import type { Filter, SimpleQueryConfig, TimeUnit } from '../types';

export const PagesBuilders: Record<string, SimpleQueryConfig> = {
	top_pages: {
		table: Analytics.events,
		fields: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END) as name",
			'COUNT(*) as pageviews',
			'COUNT(DISTINCT anonymous_id) as visitors',
			'ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage',
		],
		where: ["event_name = 'screen_view'"],
		groupBy: [
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END)",
		],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
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
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
		_filters?: Filter[],
		_granularity?: TimeUnit,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>,
			helpers?: {
				sessionAttributionCTE: (timeField?: string) => string;
				sessionAttributionJoin: (alias?: string) => string;
			}
		) => {
			const combinedWhereClause = filterConditions?.length
			? `AND ${filterConditions.join(' AND ')}`
			: '';

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE('time')},`
				: '';

			const sessionEntryQuery = helpers?.sessionAttributionCTE
				? `
            session_entry AS (
                SELECT 
                    e.session_id,
                    e.anonymous_id,
                    CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END as entry_page,
                    e.time as entry_time,
                    ROW_NUMBER() OVER (PARTITION BY e.session_id ORDER BY e.time) as page_rank,
                    sa.session_referrer as referrer,
                    sa.session_utm_source as utm_source,
                    sa.session_utm_medium as utm_medium,
                    sa.session_utm_campaign as utm_campaign,
                    sa.session_country as country,
                    sa.session_device_type as device_type,
                    sa.session_browser_name as browser_name,
                    sa.session_os_name as os_name
                FROM analytics.events e
                ${helpers.sessionAttributionJoin('e')}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.event_name = 'screen_view'
                    ${combinedWhereClause}
            )`
				: `
            session_entry AS (
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
            )`;

			return {
				sql: sessionAttributionCTE
					? `
            WITH ${sessionAttributionCTE}
            ${sessionEntryQuery}
            SELECT 
                entry_page as name,
                COUNT(*) as pageviews,
                COUNT(DISTINCT anonymous_id) as visitors,
                ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
            FROM session_entry
            WHERE page_rank = 1
            GROUP BY entry_page
            ORDER BY pageviews DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`
					: `
            WITH ${sessionEntryQuery}
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
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
		_filters?: Filter[],
		_granularity?: TimeUnit,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>,
			helpers?: {
				sessionAttributionCTE: (timeField?: string) => string;
				sessionAttributionJoin: (alias?: string) => string;
			}
		) => {
			const combinedWhereClause = filterConditions?.length
			? `AND ${filterConditions.join(' AND ')}`
			: '';

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE('time')},`
				: '';

			const sessionsQuery = helpers?.sessionAttributionCTE
				? `
            sessions AS (
                SELECT
                    e.session_id,
                    MAX(e.time) as session_end_time,
                    sa.session_referrer as referrer,
                    sa.session_utm_source as utm_source,
                    sa.session_utm_medium as utm_medium,
                    sa.session_utm_campaign as utm_campaign,
                    sa.session_country as country,
                    sa.session_device_type as device_type,
                    sa.session_browser_name as browser_name,
                    sa.session_os_name as os_name
                FROM analytics.events e
                ${helpers.sessionAttributionJoin('e')}
                WHERE e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.event_name = 'screen_view'
					${combinedWhereClause}
                GROUP BY e.session_id, sa.session_referrer, sa.session_utm_source, sa.session_utm_medium, sa.session_utm_campaign, sa.session_country, sa.session_device_type, sa.session_browser_name, sa.session_os_name
            ),`
				: `
            sessions AS (
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
            ),`;

			return {
				sql: `
            WITH ${sessionAttributionCTE}
            ${sessionsQuery}
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
			"decodeURLComponent(CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END)",
		],
		orderBy: 'pageviews DESC',
		limit: 100,
		timeField: 'time',
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
	},

	page_time_analysis: {
		allowedFilters: [
			'path',
			'country',
			'device_type',
			'browser_name',
			'os_name',
			'referrer',
			'utm_source',
			'utm_medium',
			'utm_campaign',
		],
		customizable: true,
		plugins: {
			sessionAttribution: true,
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
		_filters?: Filter[],
		_granularity?: TimeUnit,
			limit?: number,
			offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>,
			helpers?: {
				sessionAttributionCTE: (timeField?: string) => string;
				sessionAttributionJoin: (alias?: string) => string;
			}
		) => {
			const combinedWhereClause = filterConditions?.length
			? `AND ${filterConditions.join(' AND ')}`
			: '';

			const sessionAttributionCTE = helpers?.sessionAttributionCTE
				? `${helpers.sessionAttributionCTE('time')}`
				: '';

			const baseQuery = helpers?.sessionAttributionCTE
				? `
            SELECT 
                CASE WHEN trimRight(path(e.path), '/') = '' THEN '/' ELSE trimRight(path(e.path), '/') END as name,
                COUNT(*) as sessions_with_time,
                COUNT(DISTINCT e.anonymous_id) as visitors,
                ROUND(quantile(0.5)(e.time_on_page), 2) as median_time_on_page,
                ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage_of_sessions
            FROM analytics.events e
            ${helpers.sessionAttributionJoin('e')}
            WHERE e.client_id = {websiteId:String}
                AND e.time >= parseDateTimeBestEffort({startDate:String})
                AND e.time <= parseDateTimeBestEffort({endDate:String})
                AND e.event_name = 'page_exit'
                AND e.time_on_page IS NOT NULL
                AND e.time_on_page > 1
                AND e.time_on_page < 3600
                ${combinedWhereClause}
            GROUP BY name
            HAVING COUNT(*) >= 1
            ORDER BY median_time_on_page DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`
				: `
            SELECT 
                CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as name,
                COUNT(*) as sessions_with_time,
                COUNT(DISTINCT anonymous_id) as visitors,
                ROUND(quantile(0.5)(time_on_page), 2) as median_time_on_page,
                ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage_of_sessions
            FROM analytics.events
            WHERE client_id = {websiteId:String}
                AND time >= parseDateTimeBestEffort({startDate:String})
                AND time <= parseDateTimeBestEffort({endDate:String})
                AND event_name = 'page_exit'
                AND time_on_page IS NOT NULL
                AND time_on_page > 1
                AND time_on_page < 3600
                ${combinedWhereClause}
            GROUP BY name
            HAVING COUNT(*) >= 1
            ORDER BY median_time_on_page DESC
            LIMIT {limit:Int32} OFFSET {offset:Int32}`;

			return {
				sql: sessionAttributionCTE
					? `
            WITH ${sessionAttributionCTE}
            ${baseQuery}`
					: baseQuery,
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
		meta: {
			title: 'Page Time Analysis',
			description:
				'Analysis of time spent on each page, showing median time with quality filters to ensure reliable data.',
			category: 'Engagement',
			tags: ['time', 'engagement', 'pages', 'performance'],
			output_fields: [
				{
					name: 'name',
					type: 'string',
					label: 'Page Path',
					description: 'The URL path of the page',
					example: '/home',
				},
				{
					name: 'sessions_with_time',
					type: 'number',
					label: 'Sessions with Time Data',
					description: 'Number of sessions with valid time measurements',
					example: 245,
				},
				{
					name: 'visitors',
					type: 'number',
					label: 'Unique Visitors',
					description: 'Number of unique visitors with time data',
					example: 189,
				},
				{
					name: 'median_time_on_page',
					type: 'number',
					label: 'Median Time (seconds)',
					description: 'Median time spent on the page in seconds',
					unit: 'seconds',
					example: 32.5,
				},
				{
					name: 'percentage_of_sessions',
					type: 'number',
					label: 'Session %',
					description: 'Percentage of total sessions with time data',
					unit: '%',
					example: 15.8,
				},
			],
			output_example: [
				{
					name: '/home',
					sessions_with_time: 245,
					visitors: 189,
					median_time_on_page: 32.5,
					percentage_of_sessions: 15.8,
				},
				{
					name: '/about',
					sessions_with_time: 156,
					visitors: 134,
					median_time_on_page: 54.2,
					percentage_of_sessions: 10.1,
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
	},
};
