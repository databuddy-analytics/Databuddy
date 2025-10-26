import type { Filter, SimpleQueryConfig, TimeUnit } from '../types';

export const LinksBuilders: Record<string, SimpleQueryConfig> = {
	outbound_links: {
		meta: {
			title: 'Outbound Links',
			description:
				'Track external links clicked by users, showing which outbound destinations are most popular.',
			category: 'Behavior',
			tags: ['links', 'outbound', 'external', 'clicks', 'engagement'],
			output_fields: [
				{
					name: 'href',
					type: 'string',
					label: 'Destination URL',
					description: 'The external URL that was clicked',
				},
				{
					name: 'text',
					type: 'string',
					label: 'Link Text',
					description: 'The visible text of the clicked link',
				},
				{
					name: 'total_clicks',
					type: 'number',
					label: 'Total Clicks',
					description: 'Total number of clicks on this link',
				},
				{
					name: 'unique_users',
					type: 'number',
					label: 'Unique Users',
					description: 'Number of unique users who clicked this link',
				},
				{
					name: 'unique_sessions',
					type: 'number',
					label: 'Unique Sessions',
					description: 'Number of unique sessions with clicks on this link',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Click Share',
					description: 'Percentage of total outbound link clicks',
					unit: '%',
				},
				{
					name: 'last_clicked',
					type: 'string',
					label: 'Last Clicked',
					description: 'Most recent time this link was clicked',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
		_filters?: Filter[],
		_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>
		) => {
			const limit = _limit || 100;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(' AND ')}`
				: '';

			return {
				sql: `
					WITH enriched_links AS (
						SELECT 
							ol.href,
							ol.text,
							ol.anonymous_id,
							ol.session_id,
							ol.timestamp,
							-- Get context from events table using session_id
							e.path,
							e.country,
							e.device_type,
							e.browser_name,
							e.os_name,
							e.referrer,
							e.utm_source,
							e.utm_medium,
							e.utm_campaign
						FROM analytics.outgoing_links ol
						LEFT JOIN analytics.events e ON (
							ol.session_id = e.session_id 
							AND ol.client_id = e.client_id
							AND abs(dateDiff('second', ol.timestamp, e.time)) < 60
						)
						WHERE 
							ol.client_id = {websiteId:String}
							AND ol.timestamp >= parseDateTimeBestEffort({startDate:String})
							AND ol.timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
							AND ol.href IS NOT NULL
							AND ol.href != ''
							AND ol.href NOT LIKE '%undefined%'
							AND ol.href NOT LIKE '%null%'
							AND length(ol.href) > 7
							AND ol.href LIKE 'http%'
							AND position('.' IN ol.href) > 0
							AND ol.text != 'undefined'
							AND ol.text != 'null'
							AND length(trim(ol.text)) >= 0
							${combinedWhereClause}
					)
					SELECT 
						href,
						text,
						COUNT(*) as total_clicks,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage,
						MAX(timestamp) as last_clicked
					FROM enriched_links
					GROUP BY href, text
					ORDER BY total_clicks DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: 'timestamp',
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
			'client_id',
			'anonymous_id',
			'session_id',
			'href',
			'text',
		],
		customizable: true,
	},

	outbound_domains: {
		meta: {
			title: 'Outbound Domains',
			description:
				'Aggregate outbound link clicks by destination domain to see which external sites users visit most.',
			category: 'Behavior',
			tags: ['links', 'domains', 'external', 'clicks', 'destinations'],
			output_fields: [
				{
					name: 'domain',
					type: 'string',
					label: 'Domain',
					description: 'The external domain that was clicked',
				},
				{
					name: 'total_clicks',
					type: 'number',
					label: 'Total Clicks',
					description: 'Total number of clicks to this domain',
				},
				{
					name: 'unique_users',
					type: 'number',
					label: 'Unique Users',
					description:
						'Number of unique users who clicked links to this domain',
				},
				{
					name: 'unique_links',
					type: 'number',
					label: 'Unique Links',
					description: 'Number of different links clicked to this domain',
				},
				{
					name: 'percentage',
					type: 'number',
					label: 'Click Share',
					description: 'Percentage of total outbound link clicks',
					unit: '%',
				},
			],
			default_visualization: 'table',
			supports_granularity: ['hour', 'day'],
			version: '1.0',
		},

		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
		_filters?: Filter[],
		_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter['value']>
		) => {
			const limit = _limit || 100;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(' AND ')}`
				: '';

			return {
				sql: `
					WITH enriched_links AS (
						SELECT 
							ol.href,
							ol.text,
							ol.anonymous_id,
							ol.session_id,
							ol.timestamp,
							-- Get context from events table using session_id
							e.path,
							e.country,
							e.device_type,
							e.browser_name,
							e.os_name,
							e.referrer,
							e.utm_source,
							e.utm_medium,
							e.utm_campaign
						FROM analytics.outgoing_links ol
						LEFT JOIN analytics.events e ON (
							ol.session_id = e.session_id 
							AND ol.client_id = e.client_id
							AND abs(dateDiff('second', ol.timestamp, e.time)) < 60
						)
						WHERE 
							ol.client_id = {websiteId:String}
							AND ol.timestamp >= parseDateTimeBestEffort({startDate:String})
							AND ol.timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
							AND ol.href IS NOT NULL
							AND ol.href != ''
							AND ol.href NOT LIKE '%undefined%'
							AND ol.href NOT LIKE '%null%'
							AND length(ol.href) > 7
							AND ol.href LIKE 'http%'
							AND position('.' IN ol.href) > 0
							AND ol.text != 'undefined'
							AND ol.text != 'null'
							AND length(trim(ol.text)) >= 0
							${combinedWhereClause}
					)
					SELECT 
						domain(href) as domain,
						COUNT(*) as total_clicks,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT href) as unique_links,
						ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
					FROM enriched_links
					GROUP BY domain(href)
					ORDER BY total_clicks DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: 'timestamp',
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
			'client_id',
			'anonymous_id',
			'session_id',
			'href',
			'text',
		],
		customizable: true,
	},
};
