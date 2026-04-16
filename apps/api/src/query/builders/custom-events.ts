import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

function projectWhereClause(
	filterParams?: Record<string, Filter["value"]>
): string {
	// Org-level: owner_id is always the organizationId at ingestion, so a
	// primary-key scan on owner_id alone covers all events for the org.
	if (filterParams?.__orgLevel) {
		return "owner_id = {projectId:String}";
	}
	// Website-level: match either owner_id or website_id (bloom-filter indexed).
	return "(owner_id = {projectId:String} OR website_id = {projectId:String})";
}

/**
 * Separates property_key filter conditions from standard conditions.
 * property_key is a derived column (from arrayJoin) so it can't be in the CTE WHERE —
 * it must be applied in the outer query or after the CTE resolves.
 */
function separatePropertyKeyConditions(filterConditions?: string[]): {
	whereClause: string;
	propertyKeyClause: string;
} {
	const propertyKeyConditions =
		filterConditions?.filter((c) => c.includes("property_key")) ?? [];
	const otherConditions =
		filterConditions?.filter((c) => !c.includes("property_key")) ?? [];
	return {
		whereClause: otherConditions.length
			? `AND ${otherConditions.join(" AND ")}`
			: "",
		propertyKeyClause: propertyKeyConditions.length
			? `AND ${propertyKeyConditions.join(" AND ")}`
			: "",
	};
}

export const CustomEventsBuilders: Record<string, SimpleQueryConfig> = {
	custom_events: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 10_000;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						event_name as name,
						COUNT(*) as total_events,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						MAX(timestamp) as last_occurrence,
						MIN(timestamp) as first_occurrence,
						countIf(properties != '{}' AND isValidJSON(properties)) as events_with_properties,
						ROUND((COUNT(DISTINCT anonymous_id) / SUM(COUNT(DISTINCT anonymous_id)) OVER()) * 100, 2) as percentage
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						${combinedWhereClause}
					GROUP BY event_name
					ORDER BY unique_users DESC, total_events DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: [
			"namespace",
			"website_id",
			"anonymous_id",
			"session_id",
			"event_name",
			"source",
		],
		customizable: true,
	},
	custom_event_properties: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 10_000;
			const { whereClause, propertyKeyClause } =
				separatePropertyKeyConditions(filterConditions);

			return {
				sql: `
					WITH all_props AS (
						SELECT 
							event_name as name,
							arrayJoin(JSONExtractKeys(properties)) as property_key,
							trim(BOTH '"' FROM JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties)))) as property_value,
							COUNT(*) as count
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${whereClause}
						GROUP BY name, property_key, property_value
					)
					SELECT name, property_key, property_value, count
					FROM all_props
					WHERE 1 = 1
					${propertyKeyClause}
					ORDER BY count DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: [
			"namespace",
			"website_id",
			"anonymous_id",
			"session_id",
			"event_name",
			"source",
			"property_key",
		],
		customizable: true,
	},

	custom_events_by_path: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 50;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						path as name,
						COUNT(*) as total_events,
						COUNT(DISTINCT event_name) as unique_event_types,
						COUNT(DISTINCT anonymous_id) as unique_users
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						AND path IS NOT NULL AND path != ''
						${combinedWhereClause}
					GROUP BY path
					ORDER BY total_events DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
		customizable: true,
	},

	custom_events_trends: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 1000;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						toDate(timestamp) as date,
						COUNT(*) as total_events,
						COUNT(DISTINCT event_name) as unique_event_types,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						COUNT(DISTINCT path) as unique_pages
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						${combinedWhereClause}
					GROUP BY toDate(timestamp)
					ORDER BY date ASC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
	},

	custom_events_trends_by_event: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 10_000;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						toDate(timestamp) as date,
						event_name,
						COUNT(*) as total_events
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						${combinedWhereClause}
					GROUP BY toDate(timestamp), event_name
					ORDER BY date ASC, total_events DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
	},

	custom_events_summary: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						COUNT(*) as total_events,
						COUNT(DISTINCT event_name) as unique_event_types,
						COUNT(DISTINCT anonymous_id) as unique_users,
						COUNT(DISTINCT session_id) as unique_sessions,
						COUNT(DISTINCT path) as unique_pages
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						${combinedWhereClause}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
	},

	custom_events_property_cardinality: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 100;
			const { whereClause, propertyKeyClause } =
				separatePropertyKeyConditions(filterConditions);

			return {
				sql: `
					WITH property_keys AS (
						SELECT 
							event_name,
							arrayJoin(JSONExtractKeys(properties)) as property_key
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${whereClause}
					),
					cardinality_data AS (
						SELECT 
							event_name,
							property_key,
							uniqExact(JSONExtractRaw(ce.properties, pk.property_key)) as unique_values,
							COUNT(*) as occurrences
						FROM ${Analytics.custom_events} ce
						INNER JOIN property_keys pk ON ce.event_name = pk.event_name
						WHERE 
							${projectWhereClause(filterParams)}
							AND ce.timestamp >= toDateTime({startDate:String})
							AND ce.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND ce.event_name != ''
							AND ce.properties != '{}'
							AND isValidJSON(ce.properties)
							${whereClause}
						GROUP BY event_name, property_key
					)
					SELECT event_name, property_key, unique_values, occurrences
					FROM cardinality_data
					WHERE 1 = 1
					${propertyKeyClause}
					ORDER BY occurrences DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id", "property_key"],
	},

	custom_events_recent: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 50;
			const offset = _offset ?? 0;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						event_name,
						namespace,
						path,
						source,
						properties,
						anonymous_id,
						session_id,
						timestamp
					FROM ${Analytics.custom_events}
					WHERE 
						${projectWhereClause(filterParams)}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND event_name != ''
						${combinedWhereClause}
					ORDER BY timestamp DESC
					LIMIT {limit:UInt32}
					OFFSET {offset:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					offset,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
	},

	/**
	 * Property Classification Query
	 * Analyzes each property and returns classification data:
	 * - cardinality: number of unique values
	 * - total_count: total occurrences
	 * - coverage_ratio: top 10 values / total (0-1)
	 * - avg_length: average string length
	 * - max_length: max string length
	 * - is_numeric: whether all values are numeric
	 * - is_boolean: whether all values are boolean
	 * - sample_values: top 5 values with counts
	 */
	custom_events_property_classification: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 500;
			const { whereClause, propertyKeyClause } =
				separatePropertyKeyConditions(filterConditions);

			return {
				sql: `
					WITH property_values AS (
						SELECT 
							event_name,
							arrayJoin(JSONExtractKeys(properties)) as property_key,
							JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties))) as raw_value,
							trim(BOTH '"' FROM JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties)))) as clean_value
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${whereClause}
					),
					value_counts AS (
						SELECT 
							event_name,
							property_key,
							clean_value,
							COUNT(*) as value_count
						FROM property_values
						WHERE 1 = 1
						${propertyKeyClause}
						GROUP BY event_name, property_key, clean_value
					),
					top_values AS (
						SELECT 
							event_name,
							property_key,
							groupArray(10)(tuple(clean_value, value_count)) as top_10_values,
							SUM(value_count) as top_10_sum
						FROM (
							SELECT *
							FROM value_counts
							ORDER BY value_count DESC
						)
						GROUP BY event_name, property_key
					),
					property_stats AS (
						SELECT 
							event_name,
							property_key,
							COUNT(DISTINCT clean_value) as cardinality,
							COUNT(*) as total_count,
							AVG(length(clean_value)) as avg_length,
							MAX(length(clean_value)) as max_length,
							countIf(match(clean_value, '^-?[0-9]+(\\.[0-9]+)?$')) = COUNT(*) as is_numeric,
							countIf(lower(clean_value) IN ('true', 'false', '1', '0', 'yes', 'no')) = COUNT(*) as is_boolean,
							countIf(
								match(clean_value, '^[0-9]{4}-[0-9]{2}-[0-9]{2}') OR
								match(clean_value, '^[0-9]{2}/[0-9]{2}/[0-9]{4}') OR
								match(clean_value, '^[0-9]{10,13}$')
							) > COUNT(*) * 0.8 as is_date_like,
							countIf(
								startsWith(clean_value, '/') OR 
								startsWith(clean_value, 'http')
							) > COUNT(*) * 0.8 as is_url_like
						FROM property_values
						WHERE 1 = 1
						${propertyKeyClause}
						GROUP BY event_name, property_key
					)
					SELECT 
						ps.event_name,
						ps.property_key,
						ps.cardinality,
						ps.total_count,
						ROUND(tv.top_10_sum / ps.total_count, 4) as coverage_ratio,
						ROUND(ps.avg_length, 1) as avg_length,
						ps.max_length,
						ps.is_numeric,
						ps.is_boolean,
						ps.is_date_like,
						ps.is_url_like,
						CASE
							WHEN ps.is_boolean THEN 'boolean'
							WHEN ps.is_numeric THEN 'numeric'
							WHEN ps.is_date_like THEN 'datetime'
							WHEN ps.is_url_like THEN 'url'
							WHEN ps.cardinality <= 20 THEN 'categorical'
							WHEN ps.avg_length > 50 OR ps.max_length > 200 THEN 'text'
							WHEN tv.top_10_sum / ps.total_count >= 0.6 THEN 'aggregatable'
							ELSE 'high_cardinality'
						END as inferred_type,
						CASE
							WHEN ps.is_boolean OR ps.cardinality <= 5 THEN 'distribution_bar'
							WHEN ps.cardinality <= 20 THEN 'top_n_chart'
							WHEN ps.avg_length > 50 OR ps.max_length > 200 THEN 'detail_only'
							WHEN tv.top_10_sum / ps.total_count >= 0.6 THEN 'top_n_with_other'
							ELSE 'detail_only'
						END as render_strategy,
						tv.top_10_values as sample_values
					FROM property_stats ps
					JOIN top_values tv ON ps.event_name = tv.event_name AND ps.property_key = tv.property_key
					ORDER BY ps.total_count DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id", "property_key"],
	},

	/**
	 * Top N Values for a specific property (for aggregatable properties)
	 * Use this when render_strategy is 'top_n_chart' or 'top_n_with_other'
	 */
	custom_events_property_top_values: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 10;
			const { whereClause, propertyKeyClause } =
				separatePropertyKeyConditions(filterConditions);

			return {
				sql: `
					WITH all_values AS (
						SELECT 
							event_name,
							arrayJoin(JSONExtractKeys(properties)) as property_key,
							trim(BOTH '"' FROM JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties)))) as property_value,
							COUNT(*) as count
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${whereClause}
						GROUP BY event_name, property_key, property_value
					),
					filtered_values AS (
						SELECT * FROM all_values
						WHERE 1 = 1
						${propertyKeyClause}
					),
					totals AS (
						SELECT 
							event_name,
							property_key,
							SUM(count) as total
						FROM filtered_values
						GROUP BY event_name, property_key
					),
					ranked AS (
						SELECT 
							av.event_name,
							av.property_key,
							av.property_value,
							av.count,
							t.total,
							ROUND(av.count * 100.0 / t.total, 2) as percentage,
							row_number() OVER (PARTITION BY av.event_name, av.property_key ORDER BY av.count DESC) as rank
						FROM filtered_values av
						JOIN totals t ON av.event_name = t.event_name AND av.property_key = t.property_key
					)
					SELECT 
						event_name,
						property_key,
						property_value,
						count,
						total,
						percentage,
						rank
					FROM ranked
					WHERE rank <= {limit:UInt32}
					ORDER BY event_name, property_key, rank
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id", "property_key"],
	},

	/**
	 * Distribution for low-cardinality properties
	 * Returns all values with counts and percentages
	 */
	custom_events_property_distribution: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 100;
			const { whereClause, propertyKeyClause } =
				separatePropertyKeyConditions(filterConditions);

			return {
				sql: `
					WITH property_data AS (
						SELECT 
							event_name,
							arrayJoin(JSONExtractKeys(properties)) as property_key,
							trim(BOTH '"' FROM JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties)))) as property_value
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${whereClause}
					),
					filtered_data AS (
						SELECT * FROM property_data
						WHERE 1 = 1
						${propertyKeyClause}
					),
					value_counts AS (
						SELECT 
							event_name,
							property_key,
							property_value,
							COUNT(*) as count
						FROM filtered_data
						GROUP BY event_name, property_key, property_value
					),
					totals AS (
						SELECT 
							event_name,
							property_key,
							SUM(count) as total,
							COUNT(DISTINCT property_value) as cardinality
						FROM value_counts
						GROUP BY event_name, property_key
						HAVING cardinality <= 20
					)
					SELECT 
						vc.event_name,
						vc.property_key,
						vc.property_value,
						vc.count,
						t.total,
						ROUND(vc.count * 100.0 / t.total, 2) as percentage,
						t.cardinality
					FROM value_counts vc
					JOIN totals t ON vc.event_name = t.event_name AND vc.property_key = t.property_key
					ORDER BY vc.event_name, vc.property_key, vc.count DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id", "property_key"],
	},

	/**
	 * Discovery query: returns events + property keys + top 5 values per property in a single call.
	 * Replaces the need for sequential custom_events → custom_event_properties → custom_events_property_top_values.
	 */
	custom_events_discovery: {
		customSql: (
			projectId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 200;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					WITH events_summary AS (
						SELECT 
							event_name,
							COUNT(*) as total_events,
							COUNT(DISTINCT anonymous_id) as unique_users,
							COUNT(DISTINCT session_id) as unique_sessions
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							${combinedWhereClause}
						GROUP BY event_name
					),
					property_data AS (
						SELECT 
							event_name,
							arrayJoin(JSONExtractKeys(properties)) as property_key,
							trim(BOTH '"' FROM JSONExtractRaw(properties, arrayJoin(JSONExtractKeys(properties)))) as property_value
						FROM ${Analytics.custom_events}
						WHERE 
							${projectWhereClause(filterParams)}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
							AND properties != '{}'
							AND isValidJSON(properties)
							${combinedWhereClause}
					),
					value_counts AS (
						SELECT 
							event_name,
							property_key,
							property_value,
							COUNT(*) as count
						FROM property_data
						GROUP BY event_name, property_key, property_value
					),
					ranked AS (
						SELECT 
							event_name,
							property_key,
							property_value,
							count,
							row_number() OVER (PARTITION BY event_name, property_key ORDER BY count DESC) as rn
						FROM value_counts
					),
					property_summary AS (
						SELECT 
							event_name,
							property_key,
							COUNT(DISTINCT property_value) as unique_values,
							groupArray(tuple(property_value, count)) as top_values
						FROM ranked
						WHERE rn <= 5
						GROUP BY event_name, property_key
					)
					SELECT 
						es.event_name,
						es.total_events,
						es.unique_users,
						es.unique_sessions,
						ps.property_key,
						ps.unique_values,
						ps.top_values
					FROM events_summary es
					LEFT JOIN property_summary ps ON es.event_name = ps.event_name
					ORDER BY es.total_events DESC, ps.unique_values DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					projectId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		meta: {
			title: "Custom Events Discovery",
			description:
				"Returns all custom events with their property keys and top 5 values per property in a single query. Use this instead of calling custom_events, custom_event_properties, and custom_events_property_top_values separately.",
		},
		timeField: "timestamp",
		allowedFilters: ["path", "event_name", "website_id"],
	},
};
