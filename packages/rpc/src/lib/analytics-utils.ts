import { chQuery } from "@databuddy/db/clickhouse";
import { referrers } from "@databuddy/shared/lists/referrers";

export interface AnalyticsStep {
	name: string;
	step_number: number;
	target: string;
	type: "PAGE_VIEW" | "EVENT";
}

export interface StepErrorInsight {
	count: number;
	error_type: string;
	message: string;
}

export interface StepAnalytics {
	avg_time_to_complete: number;
	conversion_rate: number;
	dropoff_rate: number;
	dropoffs: number;
	error_count: number;
	error_rate: number;
	step_name: string;
	step_number: number;
	top_errors: StepErrorInsight[];
	total_users: number;
	users: number;
}

export interface FunnelTimeSeriesPoint {
	avg_time: number;
	conversion_rate: number;
	conversions: number;
	date: string;
	dropoffs: number;
	users: number;
}

export interface FunnelAnalytics {
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_rate: number;
	biggest_dropoff_step: number;
	error_insights: {
		total_errors: number;
		sessions_with_errors: number;
		dropoffs_with_errors: number;
		error_correlation_rate: number;
	};
	overall_conversion_rate: number;
	steps_analytics: StepAnalytics[];
	time_series?: FunnelTimeSeriesPoint[];
	total_users_completed: number;
	total_users_entered: number;
}

export interface ReferrerAnalytics {
	completed_users: number;
	conversion_rate: number;
	referrer: string;
	referrer_parsed: { name: string; type: string; domain: string };
	total_users: number;
}

export type ClickhouseQueryParamValue =
	| string
	| number
	| boolean
	| null
	| undefined
	| readonly string[]
	| readonly number[];

export type ClickhouseQueryParams = Record<string, ClickhouseQueryParamValue>;

interface Filter {
	field: string;
	operator: string;
	value: string | readonly string[];
}
interface ParsedReferrer {
	domain: string;
	name: string;
	type: string;
}

interface FunnelAggRow {
	avg_time: number;
	conversions: number;
	date: string;
	step_num: number;
	users: number;
}

interface ReferrerRow {
	max_step: number;
	referrer: string;
	vid: string;
}

// Helpers
const ESCAPE_BACKSLASH_REGEX = /\\/g;
const ESCAPE_LIKE_WILDCARDS_REGEX = /[%_]/g;
const WWW_PREFIX_REGEX = /^www\./;

const escapeClickhouseString = (value: string): string =>
	value
		.replace(ESCAPE_BACKSLASH_REGEX, "\\\\")
		.replace(ESCAPE_LIKE_WILDCARDS_REGEX, "\\$&");

const formatDuration = (seconds: number): string => {
	if (!seconds || seconds <= 0) {
		return "—";
	}
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60);
		const s = Math.round(seconds % 60);
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const pct = (num: number, denom: number): number =>
	denom > 0 ? Math.round((num / denom) * 10_000) / 100 : 0;

/** ClickHouse JSON often returns UInt64 as string; coercing avoids NaN and string concat bugs. */
function toFiniteNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "bigint") {
		const n = Number(value);
		return Number.isFinite(n) ? n : fallback;
	}
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

const parseReferrer = (ref: string): ParsedReferrer => {
	if (!ref || ref === "Direct" || ref.toLowerCase() === "(direct)") {
		return { name: "Direct", type: "direct", domain: "" };
	}

	try {
		const url = new URL(ref.includes("://") ? ref : `https://${ref}`);
		const host = url.hostname.replace(WWW_PREFIX_REGEX, "").toLowerCase();
		const known = referrers[url.hostname] || referrers[host];

		return known
			? { name: known.name, type: known.type, domain: host }
			: { name: host, type: "referrer", domain: host };
	} catch {
		return { name: ref, type: "referrer", domain: "" };
	}
};

// Filter building
const FIELDS = new Set([
	"event_name",
	"path",
	"referrer",
	"user_agent",
	"country",
	"city",
	"device_type",
	"browser_name",
	"os_name",
	"screen_resolution",
	"language",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
]);

const OPS = new Set([
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"in",
	"not_in",
	"is_null",
	"is_not_null",
]);

const buildFilterSQL = (
	filters: Filter[],
	params: ClickhouseQueryParams
): string => {
	const parts: string[] = [];

	for (let i = 0; i < filters.length; i++) {
		const { field, operator, value } = filters[i];
		if (!(FIELDS.has(field) && OPS.has(operator))) {
			continue;
		}

		const key = `f${i}`;

		if (operator === "is_null") {
			parts.push(`${field} IS NULL`);
			continue;
		}

		if (operator === "is_not_null") {
			parts.push(`${field} IS NOT NULL`);
			continue;
		}

		// Preserve historical behavior: if value is an array, treat it as IN/NOT IN.
		// (Even if the operator isn't "in", the old code defaulted to NOT IN.)
		if (Array.isArray(value)) {
			params[key] = value;
			parts.push(
				`${field} ${operator === "in" ? "IN" : "NOT IN"} {${key}:Array(String)}`
			);
			continue;
		}

		if (typeof value !== "string") {
			continue;
		}

		switch (operator) {
			default: {
				const escaped = escapeClickhouseString(value);

				if (operator === "contains" || operator === "not_contains") {
					params[key] = `%${escaped}%`;
					parts.push(
						`${field} ${operator === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
					);
					break;
				}

				if (operator === "starts_with") {
					params[key] = `${escaped}%`;
					parts.push(`${field} LIKE {${key}:String}`);
					break;
				}

				if (operator === "ends_with") {
					params[key] = `%${escaped}`;
					parts.push(`${field} LIKE {${key}:String}`);
					break;
				}

				params[key] = escaped;
				parts.push(
					`${field} ${operator === "equals" ? "=" : "!="} {${key}:String}`
				);
				break;
			}
		}
	}

	return parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "";
};

// Query building
const buildTimeRangeWhere = (timeColumn: "time" | "timestamp") =>
	`${timeColumn} >= parseDateTimeBestEffort({startDate:String})
		AND ${timeColumn} <= parseDateTimeBestEffort({endDate:String})`;

const buildBaseWhere = (
	timeColumn: "time" | "timestamp"
) => `client_id = {websiteId:String}
		AND ${buildTimeRangeWhere(timeColumn)}`;

const buildStepQuery = (
	step: AnalyticsStep,
	idx: number,
	filterSQL: string,
	params: ClickhouseQueryParams,
	includeReferrer = false
): string => {
	params[`n${idx}`] = step.name;
	params[`t${idx}`] = step.target;

	const refCol = includeReferrer ? ", any(referrer) as ref" : "";
	const base = buildBaseWhere("time");

	if (step.type === "PAGE_VIEW") {
		const escapedTarget = escapeClickhouseString(step.target);
		params[`t${idx}l`] = `%${escapedTarget}%`;
		return `SELECT ${idx + 1} as step, {n${idx}:String} as name, anonymous_id as vid, MIN(time) as ts${refCol}
			FROM analytics.events
			WHERE ${base} AND event_name = 'screen_view'
				AND (path = {t${idx}:String} OR path LIKE {t${idx}l:String})${filterSQL}
			GROUP BY vid`;
	}

	// EVENT: query both analytics.events (track) and analytics.custom_events (api/server)
	const refJoin = includeReferrer
		? `LEFT JOIN (
			SELECT anonymous_id as vid, argMin(referrer, time) as vref
			FROM analytics.events WHERE ${base} AND event_name = 'screen_view' AND referrer != ''
			GROUP BY vid
		) r ON e.vid = r.vid`
		: "";

	return `SELECT ${idx + 1} as step, {n${idx}:String} as name, e.vid as vid, MIN(ts) as ts${includeReferrer ? ", COALESCE(r.vref, '') as ref" : ""}
		FROM (
			SELECT anonymous_id as vid, time as ts FROM analytics.events
			WHERE ${base} AND event_name = {t${idx}:String}${filterSQL}
			UNION ALL
			SELECT COALESCE(anonymous_id, session_id, '') as vid, timestamp as ts FROM analytics.custom_events
			WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
				AND ${buildTimeRangeWhere("timestamp")}
				AND event_name = {t${idx}:String}
				AND coalesce(anonymous_id, session_id, '') != ''
		) e ${refJoin}
		GROUP BY e.vid${includeReferrer ? ", r.vref" : ""}`;
};

interface ErrorRow {
	error_count: number;
	error_type: string;
	message: string;
	path: string;
	vid: string;
}

const buildStepSubquery = (
	step: AnalyticsStep,
	paramKey: string,
	params: ClickhouseQueryParams
): string => {
	params[paramKey] = step.target;
	if (step.type === "PAGE_VIEW") {
		return `SELECT DISTINCT anonymous_id FROM analytics.events
			WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND event_name = 'screen_view'
			AND path = {${paramKey}:String}`;
	}
	return `(SELECT DISTINCT anonymous_id FROM analytics.events
		WHERE client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})
		AND event_name = {${paramKey}:String}
		UNION ALL
		SELECT DISTINCT COALESCE(anonymous_id, session_id, '') FROM analytics.custom_events
		WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
		AND timestamp >= parseDateTimeBestEffort({startDate:String})
		AND timestamp <= parseDateTimeBestEffort({endDate:String})
		AND event_name = {${paramKey}:String}
		AND COALESCE(anonymous_id, session_id, '') != '')`;
};

const queryFunnelErrors = async (
	steps: AnalyticsStep[],
	hasVisitors: boolean,
	params: ClickhouseQueryParams
): Promise<{
	errorsByPath: Map<string, ErrorRow[]>;
	sessionsWithErrors: Set<string>;
	totalErrors: number;
	dropoffsWithErrors: number;
}> => {
	const empty = {
		errorsByPath: new Map<string, ErrorRow[]>(),
		sessionsWithErrors: new Set<string>(),
		totalErrors: 0,
		dropoffsWithErrors: 0,
	};

	const firstStep = steps[0];
	if (!(hasVisitors && firstStep)) {
		return empty;
	}

	const firstStepSubquery = buildStepSubquery(
		firstStep,
		"firstStepTarget",
		params
	);

	const lastStep = steps.at(-1);
	const hasMultipleSteps = lastStep && steps.length > 1;
	const lastStepSubquery = hasMultipleSteps
		? buildStepSubquery(lastStep, "lastStepTarget", params)
		: null;

	const errorQuery = `SELECT
		path,
		anonymous_id as vid,
		error_type,
		any(message) as message,
		count() as error_count
	FROM analytics.error_spans
	WHERE client_id = {websiteId:String}
		AND timestamp >= parseDateTimeBestEffort({startDate:String})
		AND timestamp <= parseDateTimeBestEffort({endDate:String})
		AND anonymous_id IN (${firstStepSubquery})
	GROUP BY path, anonymous_id, error_type
	ORDER BY error_count DESC
	LIMIT 1000`;

	const dropoffQuery = lastStepSubquery
		? `SELECT count(DISTINCT anonymous_id) as count
		   FROM analytics.error_spans
		   WHERE client_id = {websiteId:String}
			AND timestamp >= parseDateTimeBestEffort({startDate:String})
			AND timestamp <= parseDateTimeBestEffort({endDate:String})
			AND anonymous_id IN (${firstStepSubquery})
			AND anonymous_id NOT IN (${lastStepSubquery})`
		: null;

	const [errorRows, dropoffResult] = await Promise.all([
		chQuery<ErrorRow>(errorQuery, params),
		dropoffQuery
			? chQuery<{ count: number }>(dropoffQuery, params)
			: Promise.resolve([]),
	]);

	const errorsByPath = new Map<string, ErrorRow[]>();
	const sessionsWithErrors = new Set<string>();
	let totalErrors = 0;

	for (const row of errorRows) {
		const count = toFiniteNumber(row.error_count, 0);
		const normalized: ErrorRow = {
			path: String(row.path ?? ""),
			vid: String(row.vid ?? ""),
			error_type: String(row.error_type ?? ""),
			message: String(row.message ?? ""),
			error_count: count,
		};

		sessionsWithErrors.add(normalized.vid);
		totalErrors += count;

		const existing = errorsByPath.get(normalized.path);
		if (existing) {
			existing.push(normalized);
		} else {
			errorsByPath.set(normalized.path, [normalized]);
		}
	}

	const dropoffsWithErrors = toFiniteNumber(dropoffResult[0]?.count, 0);

	return { errorsByPath, sessionsWithErrors, totalErrors, dropoffsWithErrors };
};

export const queryLinkVisitorIds = async (
	linkId: string,
	params: ClickhouseQueryParams
): Promise<Set<string>> => {
	const refParams = { ...params, linkRefPattern: `%ref=${linkId}%` };
	const rows = await chQuery<{ vid: string }>(
		`SELECT DISTINCT anonymous_id as vid
		 FROM analytics.events
		 WHERE client_id = {websiteId:String}
			AND ${buildTimeRangeWhere("time")}
			AND url LIKE {linkRefPattern:String}`,
		refParams
	);
	return new Set(rows.map((r) => String(r.vid ?? "")));
};

// Build chained step CTEs + visitor summary for ClickHouse-side funnel computation
const buildFunnelSQL = (
	stepQueries: string[],
	totalSteps: number,
	opts: {
		visitorFilterClause?: string;
		includeReferrer?: boolean;
	} = {}
): {
	cteSql: string;
	maxStepExpr: string;
	timeCols: string[];
	joinClause: string;
} => {
	const stepCTEs = [
		`s1 AS (
		SELECT vid, MIN(ts) as ts${opts.includeReferrer ? ", any(ref) as ref" : ""}
		FROM step_events WHERE step = 1${opts.visitorFilterClause ?? ""} GROUP BY vid
	)`,
	];
	for (let i = 2; i <= totalSteps; i++) {
		stepCTEs.push(`s${i} AS (
		SELECT se.vid, MIN(se.ts) as ts FROM step_events se
		INNER JOIN s${i - 1} ON se.vid = s${i - 1}.vid
		WHERE se.step = ${i} AND se.ts >= s${i - 1}.ts GROUP BY se.vid
	)`);
	}

	const joins: string[] = [];
	const maxStepParts = ["toUInt8(1)"];
	const timeCols = ["toFloat64(toUnixTimestamp(s1.ts)) as t1"];
	for (let i = 2; i <= totalSteps; i++) {
		joins.push(`LEFT JOIN s${i} ON s1.vid = s${i}.vid`);
		maxStepParts.push(`if(s${i}.vid != '', toUInt8(1), toUInt8(0))`);
		timeCols.push(`toFloat64(toUnixTimestamp(s${i}.ts)) as t${i}`);
	}

	const eventsCols = opts.includeReferrer
		? "SELECT DISTINCT step, vid, ts, ref FROM events"
		: "SELECT DISTINCT step, vid, ts FROM events";

	const cteSql = `WITH events AS (${stepQueries.join("\nUNION ALL\n")}),
step_events AS (${eventsCols}),
${stepCTEs.join(",\n")}`;

	return {
		cteSql,
		maxStepExpr: maxStepParts.join(" + "),
		timeCols,
		joinClause: joins.join(" "),
	};
};

// Aggregate per-step error insights from the error query results
const buildStepErrorInsights = (
	errorsByPath: Map<string, ErrorRow[]>,
	target: string
): {
	stepErrorCount: number;
	usersWithErrors: number;
	topErrors: StepErrorInsight[];
} => {
	const stepErrors = errorsByPath.get(target) ?? [];
	const stepErrorCount = stepErrors.reduce(
		(sum, e) => sum + toFiniteNumber(e.error_count, 0),
		0
	);
	const usersWithErrors = new Set(stepErrors.map((e) => e.vid)).size;

	const errorsByType = new Map<
		string,
		{ message: string; count: number; type: string }
	>();
	for (const e of stepErrors) {
		const ec = toFiniteNumber(e.error_count, 0);
		const existing = errorsByType.get(e.error_type);
		if (existing) {
			existing.count += ec;
		} else {
			errorsByType.set(e.error_type, {
				message: e.message,
				count: ec,
				type: e.error_type,
			});
		}
	}

	const topErrors = [...errorsByType.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, 3)
		.map((e) => ({
			message: e.message,
			error_type: e.type,
			count: toFiniteNumber(e.count, 0),
		}));

	return { stepErrorCount, usersWithErrors, topErrors };
};

// Main funnel analytics — step matching, timing, and aggregation happen in ClickHouse
export const processFunnelAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	visitorFilter?: Set<string>
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const totalSteps = steps.length;
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params)
	);

	let visitorFilterClause = "";
	if (visitorFilter && visitorFilter.size > 0) {
		params.visitorFilterIds = [...visitorFilter];
		visitorFilterClause = " AND vid IN {visitorFilterIds:Array(String)}";
	}

	const { cteSql, maxStepExpr, timeCols, joinClause } = buildFunnelSQL(
		stepQueries,
		totalSteps,
		{ visitorFilterClause }
	);

	// Per-step metrics
	const stepMetrics = [
		"SELECT toUInt8(1) as step_num, '' as date, count() as users, toFloat64(0) as avg_time, toUInt64(0) as conversions FROM visitor_summary",
	];
	for (let i = 2; i <= totalSteps; i++) {
		stepMetrics.push(
			`SELECT toUInt8(${i}), '', countIf(max_step >= ${i}), avgIf(t${i} - t${i - 1}, max_step >= ${i} AND t${i} - t${i - 1} < 86400), toUInt64(0) FROM visitor_summary`
		);
	}

	// Overall avg completion time (sentinel row)
	const sentinelStep = totalSteps + 1;
	stepMetrics.push(
		`SELECT toUInt8(${sentinelStep}), '', toUInt64(0), avgIf(t${totalSteps} - t1, max_step >= ${totalSteps} AND t${totalSteps} - t1 < 86400), toUInt64(0) FROM visitor_summary`
	);

	// Time series bucketed by step-1 entry date
	const tsQuery = `SELECT toUInt8(0), toString(entry_date), count(), avgIf(t${totalSteps} - t1, max_step >= ${totalSteps} AND t${totalSteps} - t1 < 86400), countIf(max_step >= ${totalSteps}) FROM visitor_summary GROUP BY entry_date`;

	const fullQuery = `${cteSql},
visitor_summary AS (
	SELECT s1.vid, toDate(s1.ts) as entry_date,
		${maxStepExpr} as max_step,
		${timeCols.join(", ")}
	FROM s1 ${joinClause}
)
${stepMetrics.join("\nUNION ALL\n")}
UNION ALL
${tsQuery}
ORDER BY 1, 2`;

	const [aggRows, errorData] = await Promise.all([
		chQuery<FunnelAggRow>(fullQuery, params),
		queryFunnelErrors(steps, true, params),
	]);

	const stepRows: FunnelAggRow[] = [];
	const tsRows: FunnelAggRow[] = [];
	let avgCompletionTime = 0;

	for (const row of aggRows) {
		const sn = toFiniteNumber(row.step_num, 0);
		if (sn === sentinelStep) {
			avgCompletionTime = Math.round(toFiniteNumber(row.avg_time, 0));
		} else if (sn > 0) {
			stepRows.push({ ...row, step_num: sn });
		} else {
			tsRows.push(row);
		}
	}

	stepRows.sort((a, b) => a.step_num - b.step_num);

	const totalUsers = toFiniteNumber(stepRows[0]?.users, 0);
	const completedUsers = toFiniteNumber(stepRows.at(-1)?.users, 0);
	const totalDropoffs = totalUsers - completedUsers;

	const { errorsByPath, totalErrors, sessionsWithErrors, dropoffsWithErrors } =
		errorData;

	const stepsAnalytics: StepAnalytics[] = steps.map((s, i) => {
		const stepNum = i + 1;
		const row = stepRows.find((r) => r.step_num === stepNum);
		const users = toFiniteNumber(row?.users, 0);
		const prev =
			i > 0
				? toFiniteNumber(stepRows.find((r) => r.step_num === i)?.users, 0)
				: users;
		const drops = i > 0 ? prev - users : 0;

		const { stepErrorCount, usersWithErrors, topErrors } =
			buildStepErrorInsights(errorsByPath, s.target);

		return {
			step_number: stepNum,
			step_name: s.name,
			users,
			total_users: totalUsers,
			conversion_rate: i > 0 ? pct(users, prev) : 100,
			dropoffs: drops,
			dropoff_rate: i > 0 ? pct(drops, prev) : 0,
			avg_time_to_complete: Math.round(toFiniteNumber(row?.avg_time, 0)),
			error_count: stepErrorCount,
			error_rate: pct(usersWithErrors, users),
			top_errors: topErrors,
		};
	});

	const biggestDropoff =
		stepsAnalytics.length > 1
			? stepsAnalytics
					.slice(1)
					.reduce((max, s) => (s.dropoff_rate > max.dropoff_rate ? s : max))
			: stepsAnalytics[0];

	const timeSeries: FunnelTimeSeriesPoint[] = tsRows
		.sort((a, b) => String(a.date).localeCompare(String(b.date)))
		.map((row) => {
			const users = toFiniteNumber(row.users, 0);
			const conversions = toFiniteNumber(row.conversions, 0);
			return {
				date: String(row.date),
				users,
				conversions,
				conversion_rate: pct(conversions, users),
				dropoffs: users - conversions,
				avg_time: Math.round(toFiniteNumber(row.avg_time, 0)),
			};
		});

	return {
		overall_conversion_rate: pct(completedUsers, totalUsers),
		total_users_entered: totalUsers,
		total_users_completed: completedUsers,
		avg_completion_time: avgCompletionTime,
		avg_completion_time_formatted: formatDuration(avgCompletionTime),
		biggest_dropoff_step: biggestDropoff?.step_number || 1,
		biggest_dropoff_rate: biggestDropoff?.dropoff_rate || 0,
		steps_analytics: stepsAnalytics,
		time_series: timeSeries.length > 0 ? timeSeries : undefined,
		error_insights: {
			total_errors: totalErrors,
			sessions_with_errors: sessionsWithErrors.size,
			dropoffs_with_errors: dropoffsWithErrors,
			error_correlation_rate: pct(dropoffsWithErrors, totalDropoffs),
		},
	};
};

export const processGoalAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	totalWebsiteUsers: number
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const step = steps[0];

	const sql = `WITH events AS (${buildStepQuery(step, 0, filterSQL, params)})
		 SELECT DISTINCT step, vid, ts FROM events`;
	const rows = await chQuery<{ step: number; vid: string; ts: number }>(
		sql,
		params
	);

	const goalVids = new Set(rows.map((r) => r.vid));
	const completions = goalVids.size;

	const { errorsByPath, sessionsWithErrors, totalErrors } =
		await queryFunnelErrors(steps, goalVids.size > 0, params);

	const { stepErrorCount, usersWithErrors, topErrors } = buildStepErrorInsights(
		errorsByPath,
		step.target
	);

	return {
		overall_conversion_rate: pct(completions, totalWebsiteUsers),
		total_users_entered: totalWebsiteUsers,
		total_users_completed: completions,
		avg_completion_time: 0,
		avg_completion_time_formatted: "—",
		biggest_dropoff_step: 1,
		biggest_dropoff_rate: 0,
		steps_analytics: [
			{
				step_number: 1,
				step_name: step.name,
				users: completions,
				total_users: totalWebsiteUsers,
				conversion_rate: pct(completions, totalWebsiteUsers),
				dropoffs: 0,
				dropoff_rate: 0,
				avg_time_to_complete: 0,
				error_count: stepErrorCount,
				error_rate: pct(usersWithErrors, completions),
				top_errors: topErrors,
			},
		],
		error_insights: {
			total_errors: totalErrors,
			sessions_with_errors: sessionsWithErrors.size,
			dropoffs_with_errors: 0,
			error_correlation_rate: 0,
		},
	};
};

// Referrer analytics — step matching in ClickHouse, referrer grouping in JS
export const processFunnelAnalyticsByReferrer = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams
): Promise<{ referrer_analytics: ReferrerAnalytics[] }> => {
	const filterSQL = buildFilterSQL(filters, params);
	const totalSteps = steps.length;
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params, true)
	);

	const { cteSql, maxStepExpr, joinClause } = buildFunnelSQL(
		stepQueries,
		totalSteps,
		{ includeReferrer: true }
	);

	const fullQuery = `${cteSql}
SELECT s1.vid, s1.ref as referrer,
	${maxStepExpr} as max_step
FROM s1 ${joinClause}`;

	const rows = await chQuery<ReferrerRow>(fullQuery, params);

	const groups = new Map<
		string,
		{ parsed: ParsedReferrer; total: number; completed: number }
	>();

	for (const row of rows) {
		const ref = String(row.referrer ?? "") || "Direct";
		const parsed = parseReferrer(ref);
		const key = parsed.domain || "direct";
		const maxStep = toFiniteNumber(row.max_step, 0);

		let group = groups.get(key);
		if (!group) {
			group = { parsed, total: 0, completed: 0 };
			groups.set(key, group);
		}
		group.total++;
		if (maxStep >= totalSteps) {
			group.completed++;
		}
	}

	const analytics: ReferrerAnalytics[] = [];
	for (const [key, { parsed, total, completed }] of groups) {
		if (total <= 1) {
			continue;
		}
		analytics.push({
			referrer: key,
			referrer_parsed: parsed,
			total_users: total,
			completed_users: completed,
			conversion_rate: pct(completed, total),
		});
	}

	return {
		referrer_analytics: analytics.sort((a, b) => b.total_users - a.total_users),
	};
};

// Get total unique visitors for a website in date range
export const getTotalWebsiteUsers = async (
	websiteId: string,
	startDate: string,
	endDate: string
): Promise<number> => {
	const [result] = await chQuery<{ count: number }>(
		`SELECT COUNT(DISTINCT anonymous_id) as count FROM analytics.events
		 WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND event_name = 'screen_view'`,
		{ websiteId, startDate, endDate: `${endDate} 23:59:59` }
	);
	return result?.count ?? 0;
};

// Re-export for backwards compatibility
export const buildFilterConditions = (
	filters: Filter[],
	_prefix: string,
	params: ClickhouseQueryParams
): { conditions: string; errors: string[] } => ({
	conditions: buildFilterSQL(filters, params),
	errors: [],
});
