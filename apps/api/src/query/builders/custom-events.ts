import type { Filter, SimpleQueryConfig, TimeUnit } from '../types';

export const CustomEventsBuilders: Record<string, SimpleQueryConfig> = {
	custom_events: {
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
			const limit = _limit || 10_000;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(' AND ')}`
				: '';

			return {
				sql: `
					WITH enriched_events AS (
						SELECT 
							ce.event_name,
							ce.anonymous_id,
							ce.session_id,
							ce.timestamp,
							ce.properties,
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
						FROM analytics.custom_events ce
						LEFT JOIN analytics.events e ON (
							ce.session_id = e.session_id 
							AND ce.client_id = e.client_id
							AND abs(dateDiff('second', ce.timestamp, e.time)) < 60
						)
						WHERE 
							ce.client_id = {websiteId:String}
							AND ce.timestamp >= parseDateTimeBestEffort({startDate:String})
							AND ce.timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
							AND ce.event_name != ''
							${combinedWhereClause}
					)
					SELECT 
						event_name as name,
						COUNT(*) as total_events,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						MAX(timestamp) as last_occurrence,
						MIN(timestamp) as first_occurrence,
						countIf(properties != '{}' AND isValidJSON(properties)) as events_with_properties,
						ROUND((COUNT(*) / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
					FROM enriched_events
					GROUP BY event_name
					ORDER BY total_events DESC
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
			'event_name',
		],
		customizable: true,
	},
	custom_event_properties: {
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
			const limit = _limit || 10_000;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(' AND ')}`
				: '';

			return {
				sql: `
					WITH enriched_events AS (
						SELECT 
							ce.event_name,
							ce.anonymous_id,
							ce.session_id,
							ce.timestamp,
							ce.properties,
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
						FROM analytics.custom_events ce
						LEFT JOIN analytics.events e ON (
							ce.session_id = e.session_id 
							AND ce.client_id = e.client_id
							AND abs(dateDiff('second', ce.timestamp, e.time)) < 60
						)
						WHERE 
							ce.client_id = {websiteId:String}
							AND ce.timestamp >= parseDateTimeBestEffort({startDate:String})
							AND ce.timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'))
							AND ce.event_name != ''
							AND ce.properties != '{}'
							AND isValidJSON(ce.properties)
							${combinedWhereClause}
					)
					SELECT 
						event_name as name,
						arrayJoin(JSONExtractKeys(properties)) as property_key,
						JSONExtractRaw(properties, property_key) as property_value,
						COUNT(*) as count
					FROM enriched_events
					GROUP BY event_name, property_key, property_value
					ORDER BY count DESC
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
			'event_name',
		],
		customizable: true,
	},
};
