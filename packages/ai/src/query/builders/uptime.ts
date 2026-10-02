import { normalizeGranularity } from "../expressions";
import type { Granularity, SimpleQueryConfig } from "../types";
import { TimeGranularity } from "../types";

/**
 * Uptime monitoring query builders
 * Uses uptime.uptime_monitor table
 *
 * Fields:
 * - site_id: Website identifier
 * - url: Monitored URL
 * - timestamp: Check timestamp
 * - status: 1 = up, 0 = down
 * - http_code: HTTP response code
 * - ttfb_ms: Time to first byte (ms)
 * - total_ms: Total response time (ms)
 * - ssl_expiry: SSL certificate expiry date
 * - ssl_valid: SSL certificate validity (1 = valid, 0 = invalid)
 * - probe_region: Region where check was performed
 */

const UPTIME_TABLE = "uptime.uptime_monitor";

const UPTIME_RANGE_START =
	"parseDateTimeBestEffort({startDate:String}, {timezone:String})";
const UPTIME_RANGE_END =
	"parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'), {timezone:String})";

function clippedBucketSeconds(interval: "WEEK" | "MONTH"): string {
	return `greatest(1, dateDiff('second', greatest(toDateTime(date, {timezone:String}), ${UPTIME_RANGE_START}), least(toDateTime(date + INTERVAL 1 ${interval}, {timezone:String}), ${UPTIME_RANGE_END} + 1)))`;
}

const UPTIME_BUCKET_SECONDS: Record<Exclude<Granularity, "minute">, string> = {
	hour: "3600",
	day: "86400",
	week: clippedBucketSeconds("WEEK"),
	month: clippedBucketSeconds("MONTH"),
};

function uptimeTimeGroup(granularity: Granularity, field: string): string {
	const localTime = `toTimeZone(${field}, {timezone:String})`;
	return granularity === "day"
		? `toDate(${localTime})`
		: `${TimeGranularity[granularity]}(${localTime})`;
}

export const UptimeBuilders = {
	uptime_time_series: {
		meta: {
			description: "Uptime check results plotted over time.",
			category: "Uptime",
			tags: ["uptime", "time-series"],
			supports_granularity: ["hour", "day", "week", "month"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, timezone } = ctx;
			const granularity = normalizeGranularity(ctx.granularity) ?? "hour";
			const tz = timezone || "UTC";
			const timeGroup = uptimeTimeGroup(granularity, "ts");

			const uptimePercentageExpr =
				granularity === "minute"
					? "if(total_checks = 0, 0, round(100 * successful_checks / total_checks, 2))"
					: `round(100 * (1 - least(downtime_seconds, ${UPTIME_BUCKET_SECONDS[granularity]}) / ${UPTIME_BUCKET_SECONDS[granularity]}), 2)`;

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
								AND timestamp >= ${UPTIME_RANGE_START}
								AND timestamp <= ${UPTIME_RANGE_END}
						)
						GROUP BY date
					)
					ORDER BY date ASC
				`,
				params: { websiteId, startDate, endDate, timezone: tz },
			};
		},
		commonFilters: false,
		timeField: "timestamp",
		customizable: true,
	},

	uptime_recent_checks: {
		meta: {
			description: "Most recent uptime check results.",
			category: "Uptime",
			tags: ["uptime", "recent", "checks"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const tz = ctx.timezone || "UTC";
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
						ssl_expiry,
						error
					FROM ${UPTIME_TABLE}
					WHERE 
						site_id = {websiteId:String}
						AND timestamp >= parseDateTimeBestEffort({startDate:String}, {timezone:String})
						AND timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'), {timezone:String})
					ORDER BY timestamp DESC
					LIMIT {limit:UInt32}
					OFFSET {offset:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit, offset, timezone: tz },
			};
		},
		commonFilters: false,
		timeField: "timestamp",
		customizable: true,
	},

	uptime_response_time_trends: {
		meta: {
			description: "Response time trends from uptime monitoring.",
			category: "Uptime",
			tags: ["uptime", "response-time", "trends"],
			supports_granularity: ["hour", "day", "week", "month"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const tz = ctx.timezone || "UTC";
			const timeGroup = uptimeTimeGroup(
				normalizeGranularity(ctx.granularity) ?? "hour",
				"timestamp"
			);

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
						AND timestamp >= parseDateTimeBestEffort({startDate:String}, {timezone:String})
						AND timestamp <= parseDateTimeBestEffort(concat({endDate:String}, ' 23:59:59'), {timezone:String})
						AND status = 1
					GROUP BY date
					ORDER BY date ASC
				`,
				params: { websiteId, startDate, endDate, timezone: tz },
			};
		},
		commonFilters: false,
		timeField: "timestamp",
		customizable: true,
	},
} satisfies Record<string, SimpleQueryConfig>;
