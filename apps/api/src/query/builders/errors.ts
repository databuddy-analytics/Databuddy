import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

export const ErrorsBuilders: Record<string, SimpleQueryConfig> = {
	recent_errors: {
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
			filterParams?: Record<string, Filter["value"]>
		) => {
			const limit = _limit ?? 50;
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					SELECT 
						es.message,
						es.stack,
						es.path,
						es.anonymous_id,
						es.session_id,
						es.timestamp,
						es.filename,
						es.lineno,
						es.colno,
						es.error_type,
						-- Get context from events table
						any(e.browser_name) as browser_name,
						any(e.browser_version) as browser_version,
						any(e.os_name) as os_name,
						any(e.os_version) as os_version,
						any(e.device_type) as device_type,
						any(e.country) as country,
						any(e.region) as region
					FROM ${Analytics.error_spans} es
					LEFT JOIN ${Analytics.events} e ON (
						es.session_id = e.session_id 
						AND es.client_id = e.client_id
						AND abs(dateDiff('second', es.timestamp, e.time)) < 60
					)
					WHERE 
						es.client_id = {websiteId:String}
						AND es.timestamp >= toDateTime({startDate:String})
						AND es.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND es.message != ''
						${combinedWhereClause}
					GROUP BY 
						es.message,
						es.stack,
						es.path,
						es.anonymous_id,
						es.session_id,
						es.timestamp,
						es.filename,
						es.lineno,
						es.colno,
						es.error_type
					ORDER BY es.timestamp DESC
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
		timeField: "timestamp",
		allowedFilters: [
			"path",
			"browser_name",
			"os_name",
			"country",
			"message",
			"device_type",
			"error_type",
		],
		customizable: true,
		plugins: {
			normalizeGeo: true,
		},
	},

	error_types: {
		table: Analytics.error_spans,
		fields: [
			"message as name",
			"COUNT(*) as count",
			"uniq(anonymous_id) as users",
			"MAX(timestamp) as last_seen",
		],
		where: ["message != ''"],
		groupBy: ["message"],
		orderBy: "count DESC",
		limit: 50,
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
		customizable: true,
	},

	error_trends: {
		table: Analytics.error_spans,
		fields: [
			"toDate(timestamp) as date",
			"COUNT(*) as errors",
			"uniq(anonymous_id) as users",
		],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	errors_by_page: {
		table: Analytics.error_spans,
		fields: [
			"path as name",
			"COUNT(*) as errors",
			"uniq(anonymous_id) as users",
		],
		where: ["message != ''", "path != ''"],
		groupBy: ["path"],
		orderBy: "errors DESC",
		limit: 20,
		timeField: "timestamp",
		allowedFilters: ["path", "message", "error_type"],
		customizable: true,
	},

	error_frequency: {
		table: Analytics.error_spans,
		fields: ["toDate(timestamp) as date", "COUNT(*) as count"],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	error_summary: {
		meta: {
			title: "Error Summary",
			description: "Overview of errors with calculated error rate",
			version: "1.0",
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
			filterParams?: Record<string, Filter["value"]>
		) => {
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
					WITH total_sessions AS (
						SELECT uniq(session_id) as total 
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String} 
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					),
					error_sessions AS (
						SELECT uniq(session_id) as error_count 
						FROM ${Analytics.error_spans}
						WHERE client_id = {websiteId:String} 
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND message != ''
						${combinedWhereClause}
					),
					error_stats AS (
						SELECT 
							COUNT(*) as totalErrors,
							uniq(message) as uniqueErrorTypes,
							uniq(anonymous_id) as affectedUsers,
							uniq(session_id) as affectedSessions
						FROM ${Analytics.error_spans}
						WHERE client_id = {websiteId:String} 
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND message != ''
						${combinedWhereClause}
					)
					SELECT 
						es.totalErrors,
						es.uniqueErrorTypes,
						es.affectedUsers,
						es.affectedSessions,
						ROUND((err.error_count / ts.total) * 100, 2) as errorRate
					FROM error_stats es
					CROSS JOIN total_sessions ts
					CROSS JOIN error_sessions err
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
		customizable: true,
	},

	error_chart_data: {
		table: Analytics.error_spans,
		fields: [
			"toDate(timestamp) as date",
			"COUNT(*) as totalErrors",
			"uniq(anonymous_id) as affectedUsers",
		],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	errors_by_type: {
		table: Analytics.error_spans,
		fields: [
			"error_type as name",
			"COUNT(*) as count",
			"uniq(anonymous_id) as users",
			"uniq(session_id) as sessions",
		],
		where: ["message != ''", "error_type != ''"],
		groupBy: ["error_type"],
		orderBy: "count DESC",
		limit: 20,
		timeField: "timestamp",
		allowedFilters: ["path", "message", "error_type"],
		customizable: true,
	},
};
