import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

export const ErrorsBuilders: Record<string, SimpleQueryConfig> = {
	recent_errors: {
		meta: {
			description:
				"Recent JS errors with full context: message, stack (capped at 1500 chars), path, error_type, browser, OS, device, country. For aggregates use error_summary / errors_by_type / errors_by_page.",
			category: "Errors",
			tags: ["errors", "recent", "debugging"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const limit = ctx.limit ?? 50;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					WITH session_context AS (
						SELECT
							session_id,
							client_id,
							any(browser_name) as browser_name,
							any(browser_version) as browser_version,
							any(os_name) as os_name,
							any(os_version) as os_version,
							any(device_type) as device_type,
							any(country) as country,
							any(region) as region
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						GROUP BY session_id, client_id
					)
					SELECT
						es.message,
						substring(es.stack, 1, 1500) as stack,
						es.path,
						es.anonymous_id,
						es.session_id,
						es.timestamp,
						es.filename,
						es.lineno,
						es.colno,
						es.error_type,
						sc.browser_name,
						sc.browser_version,
						sc.os_name,
						sc.os_version,
						sc.device_type,
						sc.country,
						sc.region
					FROM ${Analytics.error_spans} es
					LEFT JOIN session_context sc ON es.session_id = sc.session_id AND es.client_id = sc.client_id
					WHERE
						es.client_id = {websiteId:String}
						AND es.timestamp >= toDateTime({startDate:String})
						AND es.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND es.message != ''
						${filterClause}
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
		meta: {
			description:
				"Top error MESSAGES with count, affected users, and last_seen. Group key is the message string. For grouping by JS class (TypeError, ReferenceError, …) use errors_by_type.",
			category: "Errors",
			tags: ["errors", "messages", "triage"],
		},
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
		meta: {
			description: "Error counts over time to identify spikes and trends.",
			category: "Errors",
			tags: ["errors", "trends", "time-series"],
		},
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
		meta: {
			description: "Error counts grouped by the page where they occurred.",
			category: "Errors",
			tags: ["errors", "pages"],
		},
		table: Analytics.error_spans,
		fields: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as name",
			"COUNT(*) as errors",
			"uniq(anonymous_id) as users",
		],
		where: ["message != ''", "path != ''"],
		groupBy: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END",
		],
		orderBy: "errors DESC",
		limit: 20,
		timeField: "timestamp",
		allowedFilters: ["path", "message", "error_type"],
		customizable: true,
	},

	error_frequency: {
		meta: {
			description: "Error frequency and recurrence patterns.",
			category: "Errors",
			tags: ["errors", "frequency"],
		},
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
			category: "Errors",
			tags: ["errors", "summary", "overview"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					WITH total_sessions AS (
						SELECT uniq(session_id) as total
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					),
					error_stats AS (
						SELECT
							count() as totalErrors,
							uniq(message) as uniqueErrorTypes,
							uniq(anonymous_id) as affectedUsers,
							uniq(session_id) as affectedSessions
						FROM ${Analytics.error_spans}
						WHERE client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND message != ''
						${filterClause}
					)
					SELECT
						es.totalErrors,
						es.uniqueErrorTypes,
						es.affectedUsers,
						es.affectedSessions,
						ROUND((es.affectedSessions / ts.total) * 100, 2) as errorRate
					FROM error_stats es
					CROSS JOIN total_sessions ts
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
		meta: {
			description: "Error counts formatted for time-series chart display.",
			category: "Errors",
			tags: ["errors", "chart", "time-series"],
		},
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
		meta: {
			description:
				"Errors grouped by JS error class (TypeError, ReferenceError, …) with count, affected users, and sessions. For grouping by error message use error_types.",
			category: "Errors",
			tags: ["errors", "class", "triage"],
		},
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
