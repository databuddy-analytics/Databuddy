import type { SimpleQueryConfig } from "../types";

/**
 * Uptime monitoring query builders
 * Uses uptime.uptime_monitor table
 *
 * Fields:
 * - site_id: Website identifier
 * - url: Monitored URL
 * - timestamp: Check timestamp
 * - status: 1 = up, 0 = down, 2 = pending (retry logic - excluded from uptime)
 * - http_code: HTTP response code
 * - ttfb_ms: Time to first byte (ms)
 * - total_ms: Total response time (ms)
 * - ssl_expiry: SSL certificate expiry date
 * - ssl_valid: SSL certificate validity (1 = valid, 0 = invalid)
 * - probe_region: Region where check was performed
 */

const UPTIME_TABLE = "uptime.uptime_monitor";

export const UptimeBuilders: Record<string, SimpleQueryConfig> = {
	uptime_overview: {
		meta: {
			description:
				"Uptime monitoring overview with availability percentage and response times.",
			category: "Uptime",
			tags: ["uptime", "overview", "monitoring"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT
					if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage,
					avg(total_ms) as avg_response_time,
					quantileTDigest(0.50)(total_ms) as p50_response_time,
					quantileTDigest(0.75)(total_ms) as p75_response_time,
					quantileTDigest(0.95)(total_ms) as p95_response_time,
					quantileTDigest(0.99)(total_ms) as p99_response_time,
					max(total_ms) as max_response_time,
					min(total_ms) as min_response_time,
					avg(ttfb_ms) as avg_ttfb,
					any(ssl_expiry) as ssl_expiry,
					min(ssl_valid) as ssl_valid
				FROM ${UPTIME_TABLE}
				WHERE 
					site_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	uptime_time_series: {
		meta: {
			description: "Uptime check results plotted over time.",
			category: "Uptime",
			tags: ["uptime", "time-series"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, timezone } = ctx;
			const granularity = ctx.granularity ?? "hour";
			const tz = timezone || "UTC";
			const timeGroup =
				granularity === "minute"
					? "toStartOfMinute(ts)"
					: granularity === "hour"
						? "toStartOfHour(ts)"
						: granularity === "day"
							? "toDate(toTimeZone(ts, {timezone:String}))"
							: "toStartOfHour(ts)";

			const windowSec =
				granularity === "day" ? 86_400 : granularity === "hour" ? 3600 : 60;

			const uptimePercentageExpr =
				granularity === "minute"
					? "if(total_checks = 0, 0, round(100 * successful_checks / total_checks, 2))"
					: `round(100 * (1 - least(downtime_seconds, ${windowSec}) / ${windowSec}), 2)`;

			return {
				sql: `
					SELECT
						date,
						${uptimePercentageExpr} as uptime_percentage,
						total_checks,
						successful_checks,
						downtime_seconds,
						avg_response_time,
						p50_response_time,
						p95_response_time,
						max_response_time,
						avg_ttfb,
						p50_ttfb,
						p95_ttfb
					FROM (
						SELECT
							${timeGroup} as date,
							toUInt32(countIf(status = 1) + countIf(status = 0)) as total_checks,
							toUInt32(countIf(status = 1)) as successful_checks,
							toUInt32(sumIf(
								least(dateDiff('second', ts, next_ts), 86400),
								status = 0
							)) as downtime_seconds,
							avg(total_ms) as avg_response_time,
							quantileTDigest(0.50)(total_ms) as p50_response_time,
							quantileTDigest(0.95)(total_ms) as p95_response_time,
							max(total_ms) as max_response_time,
							avg(ttfb_ms) as avg_ttfb,
							quantileTDigest(0.50)(ttfb_ms) as p50_ttfb,
							quantileTDigest(0.95)(ttfb_ms) as p95_ttfb
						FROM (
							SELECT
								timestamp as ts,
								status,
								total_ms,
								ttfb_ms,
								leadInFrame(timestamp, 1, now()) OVER (
									ORDER BY timestamp ASC
									ROWS BETWEEN CURRENT ROW AND UNBOUNDED FOLLOWING
								) as next_ts
							FROM ${UPTIME_TABLE}
							WHERE
								site_id = {websiteId:String}
								AND timestamp >= parseDateTimeBestEffort({startDate:String}, {timezone:String})
								AND timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'), {timezone:String})
						)
						GROUP BY date
					)
					ORDER BY date ASC
				`,
				params: { websiteId, startDate, endDate, timezone: tz },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	uptime_status_breakdown: {
		meta: {
			description: "Distribution of uptime check results by status code.",
			category: "Uptime",
			tags: ["uptime", "status", "distribution"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT
					status,
					http_code,
					COUNT(*) as count,
					round((COUNT(*) / sum(COUNT(*)) OVER ()) * 100, 2) as percentage
				FROM ${UPTIME_TABLE}
				WHERE 
					site_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				GROUP BY status, http_code
				ORDER BY count DESC
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	uptime_recent_checks: {
		meta: {
			description: "Most recent uptime check results.",
			category: "Uptime",
			tags: ["uptime", "recent", "checks"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 50;
			const offset = ctx.offset ?? 0;
			return {
				sql: `
					SELECT
						timestamp,
						url,
						status,
						http_code,
						ttfb_ms,
						total_ms,
						probe_region,
						probe_ip,
						ssl_valid,
						error
					FROM ${UPTIME_TABLE}
					WHERE 
						site_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					ORDER BY timestamp DESC
					LIMIT {limit:UInt32}
					OFFSET {offset:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit, offset },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	uptime_response_time_trends: {
		meta: {
			description: "Response time trends from uptime monitoring.",
			category: "Uptime",
			tags: ["uptime", "response-time", "trends"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const granularity = ctx.granularity ?? "hour";
			const timeGroup =
				granularity === "minute"
					? "toStartOfMinute(timestamp)"
					: granularity === "hour"
						? "toStartOfHour(timestamp)"
						: granularity === "day"
							? "toDate(timestamp)"
							: "toStartOfHour(timestamp)";

			return {
				sql: `
					SELECT 
						${timeGroup} as date,
						avg(total_ms) as avg_response_time,
						quantileTDigest(0.50)(total_ms) as p50_response_time,
						quantileTDigest(0.75)(total_ms) as p75_response_time,
						quantileTDigest(0.90)(total_ms) as p90_response_time,
						quantileTDigest(0.95)(total_ms) as p95_response_time,
						quantileTDigest(0.99)(total_ms) as p99_response_time,
						min(total_ms) as min_response_time,
						max(total_ms) as max_response_time,
						avg(ttfb_ms) as avg_ttfb
					FROM ${UPTIME_TABLE}
					WHERE 
						site_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND status = 1
					GROUP BY date
					ORDER BY date ASC
				`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: true,
	},

	uptime_ssl_status: {
		meta: {
			description: "SSL certificate status and expiry information.",
			category: "Uptime",
			tags: ["uptime", "ssl", "certificate"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT
					latest_ssl_expiry as ssl_expiry,
					latest_ssl_valid as ssl_valid,
					invalid_ssl_checks
				FROM (
					SELECT
						argMax(ssl_expiry, timestamp) as latest_ssl_expiry,
						argMax(ssl_valid, timestamp) as latest_ssl_valid,
						countIf(ssl_valid = 0) as invalid_ssl_checks
					FROM ${UPTIME_TABLE}
					WHERE 
						site_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					GROUP BY site_id
				)
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	uptime_by_region: {
		meta: {
			description:
				"Uptime and response times broken down by monitoring region.",
			category: "Uptime",
			tags: ["uptime", "regions", "geography"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			return {
				sql: `
				SELECT
					probe_region as region,
					if((countIf(status = 1) + countIf(status = 0)) = 0, 0, round((countIf(status = 1) / (countIf(status = 1) + countIf(status = 0))) * 100, 2)) as uptime_percentage,
					avg(total_ms) as avg_response_time,
					quantileTDigest(0.95)(total_ms) as p95_response_time
				FROM ${UPTIME_TABLE}
				WHERE 
					site_id = {websiteId:String}
					AND timestamp >= toDateTime({startDate:String})
					AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
				GROUP BY probe_region
				ORDER BY uptime_percentage DESC
			`,
				params: { websiteId, startDate, endDate },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},
};
