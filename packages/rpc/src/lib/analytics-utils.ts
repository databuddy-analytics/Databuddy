import { chQuery } from "@databuddy/db/clickhouse";
import { goalFunnelFilterFieldSet } from "@databuddy/shared/analytics-filters";
import { parseReferrer } from "@databuddy/shared/utils/referrer";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
	error_context_available: boolean;
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
	duration_available: boolean;
	error_insights: {
		available: boolean;
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

export interface FunnelConversionCounts {
	completions: number;
	entrants: number;
	rate: number;
	steps: { stepNumber: number; users: number }[];
}

interface ReferrerRow {
	max_step: number;
	referrer: string;
	vid: string;
}

// Helpers
const ESCAPE_BACKSLASH_REGEX = /\\/g;
const ESCAPE_LIKE_WILDCARDS_REGEX = /[%_]/g;
const escapeClickhouseString = (value: string): string =>
	value
		.replace(ESCAPE_BACKSLASH_REGEX, "\\\\")
		.replace(ESCAPE_LIKE_WILDCARDS_REGEX, "\\$&");

const trimTrailingSlashes = (value: string): string => {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) {
		end--;
	}
	return value.slice(0, end);
};

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

const FIELDS = goalFunnelFilterFieldSet;

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
	params: ClickhouseQueryParams,
	sourceAlias?: string,
	paramPrefix = "f"
): string => {
	const parts: string[] = [];

	for (let i = 0; i < filters.length; i++) {
		const { field, operator, value } = filters[i];
		if (!(FIELDS.has(field) && OPS.has(operator))) {
			continue;
		}

		const key = `${paramPrefix}${i}`;
		const sourceField = field === "screen_resolution" ? "viewport_size" : field;
		const qualifiedField = sourceAlias
			? `${sourceAlias}.${sourceField}`
			: sourceField;
		const sqlField =
			field === "path"
				? normalizedPathExpression(qualifiedField)
				: qualifiedField;
		const normalizeExactPathValue =
			field === "path" &&
			(operator === "equals" ||
				operator === "not_equals" ||
				operator === "in" ||
				operator === "not_in");

		if (operator === "is_null") {
			parts.push(`${sqlField} IS NULL`);
			continue;
		}

		if (operator === "is_not_null") {
			parts.push(`${sqlField} IS NOT NULL`);
			continue;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) {
				continue;
			}
			const negate = operator === "not_in" || operator === "not_equals";
			params[key] = normalizeExactPathValue
				? value.map(normalizeGoalPathTarget)
				: value;
			parts.push(
				`${sqlField} ${negate ? "NOT IN" : "IN"} {${key}:Array(String)}`
			);
			continue;
		}

		if (typeof value !== "string") {
			continue;
		}

		if (operator === "contains" || operator === "not_contains") {
			params[key] = `%${escapeClickhouseString(value)}%`;
			parts.push(
				`${sqlField} ${operator === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
			);
			continue;
		}

		if (operator === "starts_with") {
			params[key] = `${escapeClickhouseString(value)}%`;
			parts.push(`${sqlField} LIKE {${key}:String}`);
			continue;
		}

		if (operator === "ends_with") {
			params[key] = `%${escapeClickhouseString(value)}`;
			parts.push(`${sqlField} LIKE {${key}:String}`);
			continue;
		}

		const isNegative = operator === "not_equals" || operator === "not_in";
		params[key] = normalizeExactPathValue
			? normalizeGoalPathTarget(value)
			: value;
		parts.push(`${sqlField} ${isNegative ? "!=" : "="} {${key}:String}`);
	}

	return parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "";
};

// Query building
const buildTimeRangeWhere = (timeColumn: string) =>
	`${timeColumn} >= parseDateTimeBestEffort({startDate:String})
		AND ${timeColumn} <= parseDateTimeBestEffort({endDate:String})`;

const buildBaseWhere = (
	timeColumn: "time" | "timestamp"
) => `client_id = {websiteId:String}
		AND ${buildTimeRangeWhere(timeColumn)}`;

const customEventRows = (projection: string): string => `SELECT ${projection}
	FROM analytics.custom_events
	WHERE owner_id = {websiteId:String}
		AND ${buildTimeRangeWhere("timestamp")}
	UNION ALL
	SELECT ${projection}
	FROM analytics.custom_events
	WHERE website_id = {websiteId:String}
		AND owner_id != {websiteId:String}
		AND ${buildTimeRangeWhere("timestamp")}`;

const visitorIdentityCtes = `visitor_identity_rows AS (
	SELECT
		profile_id,
		anonymous_id,
		session_id,
		time AS identity_time
	FROM analytics.events
	WHERE ${buildBaseWhere("time")}
	UNION ALL
	${customEventRows(`
		profile_id,
		ifNull(anonymous_id, '') AS anonymous_id,
		ifNull(session_id, '') AS session_id,
		timestamp AS identity_time`)}
),
visitor_profiles_by_anonymous AS (
	SELECT
		anonymous_id,
		arraySort(groupArray((identity_time, profile_id))) AS profile_history
	FROM visitor_identity_rows
	WHERE anonymous_id != '' AND profile_id != ''
	GROUP BY anonymous_id
),
visitor_identity_by_session AS (
	SELECT
		session_id,
		argMaxIf(profile_id, identity_time, profile_id != '') AS mapped_profile_id,
		argMaxIf(anonymous_id, identity_time, anonymous_id != '') AS mapped_anonymous_id
	FROM visitor_identity_rows
	WHERE session_id != ''
	GROUP BY session_id
)`;

const identityJoins = (source: string): string => `
	LEFT JOIN visitor_profiles_by_anonymous direct_profile
		ON ${source}.anonymous_id = direct_profile.anonymous_id
	LEFT JOIN visitor_identity_by_session session_identity
		ON ${source}.session_id = session_identity.session_id
	LEFT JOIN visitor_profiles_by_anonymous session_profile
		ON session_identity.mapped_anonymous_id = session_profile.anonymous_id`;

const profileAtRowTime = (
	source: string,
	profileSource: string,
	identityTime = `${source}.identity_time`
): string =>
	`tupleElement(
	arrayLast(
		identity -> tupleElement(identity, 1) <= ${identityTime},
		${profileSource}.profile_history
	),
	2
)`;

const canonicalVisitorExpression = (
	source: string,
	identityTime?: string
): string => `coalesce(
	nullIf(${source}.profile_id, ''),
	nullIf(session_identity.mapped_profile_id, ''),
	nullIf(${profileAtRowTime(source, "direct_profile", identityTime)}, ''),
	nullIf(${profileAtRowTime(source, "session_profile", identityTime)}, ''),
	nullIf(${source}.anonymous_id, ''),
	nullIf(session_identity.mapped_anonymous_id, ''),
	''
)`;

const pathOnlyExpression = (field = "path") =>
	`if(startsWith(${field}, 'http://') OR startsWith(${field}, 'https://'), path(${field}), ${field})`;

const normalizedPathExpression = (field = "path") => {
	const pathOnly = pathOnlyExpression(field);
	return `CASE WHEN trimRight(${pathOnly}, '/') = '' THEN '/' ELSE trimRight(${pathOnly}, '/') END`;
};

const normalizeGoalPathTarget = (target: string): string => {
	const trimmed = target.trim();
	if (!trimmed) {
		return "/";
	}
	let pathOnly = trimmed;
	if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
		try {
			pathOnly = new URL(trimmed).pathname;
		} catch {
			pathOnly = trimmed;
		}
	}
	if (!pathOnly.startsWith("/")) {
		pathOnly = `/${pathOnly}`;
	}
	const withoutTrailingSlash = trimTrailingSlashes(pathOnly);
	return withoutTrailingSlash || "/";
};

function buildIdentifiedEventStream(
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	options: { includeReferrer?: boolean } = {}
): string {
	const browserFilter = buildFilterSQL(filters, params, "row", "browserFilter");
	const directCustomFilters = filters.filter(
		(filter) => filter.field === "event_name" || filter.field === "path"
	);
	const contextFilters = filters.filter(
		(filter) => filter.field !== "event_name" && filter.field !== "path"
	);
	const directCustomFilter = buildFilterSQL(
		directCustomFilters,
		params,
		"row",
		"customFilter"
	);
	const contextFilter = buildFilterSQL(
		contextFilters,
		params,
		"identified",
		"contextFilter"
	);
	const stepCases = steps.map((step, index) => {
		const stepNumber = index + 1;
		const targetKey = `t${index}`;
		params[targetKey] =
			step.type === "PAGE_VIEW"
				? normalizeGoalPathTarget(step.target)
				: step.target;
		const baseMatch =
			step.type === "PAGE_VIEW"
				? `row.source_kind = 1
					AND row.event_name = 'screen_view'
					AND ${normalizedPathExpression("row.path")} = {${targetKey}:String}`
				: `row.event_name = {${targetKey}:String}`;
		let matches = baseMatch;
		if (index === 0 && filters.length > 0) {
			if (step.type === "PAGE_VIEW") {
				matches = `${baseMatch}${browserFilter}`;
			} else {
				const customHasContext = contextFilters.length
					? `(row.source_kind = 1${browserFilter}
						OR (row.source_kind = 2${directCustomFilter}
							AND row.last_matching_context_ms > 0
							AND row.last_matching_context_ms <= toUnixTimestamp64Milli(row.identity_time)
							AND row.last_matching_context_ms >= toUnixTimestamp64Milli(row.identity_time) - 86400000))`
					: `(row.source_kind = 1${browserFilter}
						OR (row.source_kind = 2${directCustomFilter}))`;
				matches = `${baseMatch} AND ${customHasContext}`;
			}
		}
		return `if(ifNull(${matches}, false), toUInt8(${stepNumber}), toUInt8(0))`;
	});
	const visitor = canonicalVisitorExpression("source_row");
	return `analytics_rows AS (
	SELECT
		toUInt8(1) AS source_kind,
		profile_id,
		anonymous_id,
		session_id,
		time AS identity_time,
		event_name,
		path,
		referrer,
		country,
		city,
		device_type,
		browser_name,
		os_name,
		language,
		utm_source,
		utm_medium,
		utm_campaign,
		utm_term,
		utm_content,
		user_agent,
		viewport_size
	FROM analytics.events
	WHERE ${buildBaseWhere("time")}
	UNION ALL
	${customEventRows(`
		toUInt8(2) AS source_kind,
		profile_id,
		ifNull(anonymous_id, '') AS anonymous_id,
		ifNull(session_id, '') AS session_id,
		timestamp AS identity_time,
		event_name,
		path,
		CAST(NULL, 'Nullable(String)') AS referrer,
		CAST(NULL, 'Nullable(String)') AS country,
		CAST(NULL, 'Nullable(String)') AS city,
		CAST(NULL, 'Nullable(String)') AS device_type,
		CAST(NULL, 'Nullable(String)') AS browser_name,
		CAST(NULL, 'Nullable(String)') AS os_name,
		CAST(NULL, 'Nullable(String)') AS language,
		CAST(NULL, 'Nullable(String)') AS utm_source,
		CAST(NULL, 'Nullable(String)') AS utm_medium,
		CAST(NULL, 'Nullable(String)') AS utm_campaign,
		CAST(NULL, 'Nullable(String)') AS utm_term,
		CAST(NULL, 'Nullable(String)') AS utm_content,
		CAST(NULL, 'Nullable(String)') AS user_agent,
		CAST(NULL, 'Nullable(String)') AS viewport_size`)}
),
identified_rows AS (
	SELECT
		source_row.source_kind AS source_kind,
		source_row.profile_id AS profile_id,
		source_row.anonymous_id AS anonymous_id,
		source_row.session_id AS session_id,
		source_row.identity_time AS identity_time,
		source_row.event_name AS event_name,
		source_row.path AS path,
		source_row.referrer AS referrer,
		source_row.country AS country,
		source_row.city AS city,
		source_row.device_type AS device_type,
		source_row.browser_name AS browser_name,
		source_row.os_name AS os_name,
		source_row.language AS language,
		source_row.utm_source AS utm_source,
		source_row.utm_medium AS utm_medium,
		source_row.utm_campaign AS utm_campaign,
		source_row.utm_term AS utm_term,
		source_row.utm_content AS utm_content,
		source_row.user_agent AS user_agent,
		source_row.viewport_size AS viewport_size,
		${visitor} AS vid
	FROM analytics_rows source_row${identityJoins("source_row")}
	WHERE ${visitor} != ''
),
context_rows AS (
	SELECT
		context.*,
		if(
			context.session_id != '',
			context.last_matching_session_context_ms,
			context.last_matching_visitor_context_ms
		) AS last_matching_context_ms,
		${
			options.includeReferrer
				? `argMaxIf(
			ifNull(context.referrer, ''),
			context.identity_time,
			context.source_kind = 1
				AND context.event_name = 'screen_view'
				AND ifNull(context.referrer, '') != ''
		) OVER (
			PARTITION BY context.vid
			ORDER BY context.identity_time, context.source_kind
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		)`
				: "''"
		} AS last_browser_referrer
	FROM (
		SELECT
			identified.*,
			${
				contextFilters.length > 0
					? `maxIf(
			toUnixTimestamp64Milli(identified.identity_time),
			identified.source_kind = 1${contextFilter}
		) OVER (
			PARTITION BY identified.vid
			ORDER BY identified.identity_time, identified.source_kind
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		)`
					: "toInt64(0)"
			} AS last_matching_visitor_context_ms,
			${
				contextFilters.length > 0
					? `maxIf(
			toUnixTimestamp64Milli(identified.identity_time),
			identified.source_kind = 1${contextFilter}
		) OVER (
			PARTITION BY identified.vid, identified.session_id
			ORDER BY identified.identity_time, identified.source_kind
			ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
		)`
					: "toInt64(0)"
			} AS last_matching_session_context_ms
		FROM identified_rows identified
	) context
),
events AS (
	SELECT
		arrayJoin(arrayFilter(value -> value > 0, [${stepCases.join(", ")}])) AS step,
		row.vid AS vid,
		row.identity_time AS ts,
		if(
			row.source_kind = 1,
			ifNull(row.referrer, ''),
			row.last_browser_referrer
		) AS ref
	FROM context_rows row
)`;
}

export const queryLinkVisitorIds = async (
	linkId: string,
	params: ClickhouseQueryParams
): Promise<Set<string>> => {
	const refParams = { ...params, linkRefPattern: `%ref=${linkId}%` };
	const eventVisitor = canonicalVisitorExpression("event", "event.time");
	const rows = await chQuery<{ vid: string }>(
		`WITH ${visitorIdentityCtes}
		 SELECT DISTINCT ${eventVisitor} as vid
		 FROM analytics.events event${identityJoins("event")}
		 WHERE event.client_id = {websiteId:String}
			AND ${buildTimeRangeWhere("event.time")}
			AND event.url LIKE {linkRefPattern:String}
			AND ${eventVisitor} != ''`,
		refParams
	);
	return new Set(rows.map((r) => String(r.vid ?? "")));
};

/**
 * Cheap detector path: one event stream and one visitor aggregation. It deliberately
 * excludes time series, duration, and error context; those belong to investigation.
 */
export const processFunnelConversionCounts = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	abortSignal?: AbortSignal
): Promise<FunnelConversionCounts> => {
	if (steps.length === 0) {
		return { completions: 0, entrants: 0, rate: 0, steps: [] };
	}

	const conditions = steps.map((_, index) => `step = ${index + 1}`).join(", ");
	const query = `WITH ${visitorIdentityCtes},
${buildIdentifiedEventStream(steps, filters, params)},
visitor_progress AS (
	SELECT
		vid,
		windowFunnel(86400000)(toUInt64(toUnixTimestamp64Milli(ts)), ${conditions}) AS max_step
	FROM events
	GROUP BY vid
)
SELECT
	toUInt8(step_number) AS step_num,
	countIf(max_step >= step_number) AS users
FROM visitor_progress
ARRAY JOIN range(1, ${steps.length + 1}) AS step_number
GROUP BY step_number
ORDER BY step_number`;
	const rows = await chQuery<{ step_num: number; users: number }>(
		query,
		params,
		{
			abort_signal: abortSignal,
		}
	);
	const usersByStep = new Map(
		rows.map((row) => [
			toFiniteNumber(row.step_num, 0),
			toFiniteNumber(row.users, 0),
		])
	);
	const stepCounts = steps.map((_, index) => ({
		stepNumber: index + 1,
		users: usersByStep.get(index + 1) ?? 0,
	}));
	const entrants = stepCounts[0]?.users ?? 0;
	const completions = stepCounts.at(-1)?.users ?? 0;
	return {
		completions,
		entrants,
		rate: pct(completions, entrants),
		steps: stepCounts,
	};
};

export const processGoalConversionCount = async (
	step: AnalyticsStep,
	filters: Filter[],
	params: ClickhouseQueryParams,
	abortSignal?: AbortSignal
): Promise<number> => {
	const query = `WITH ${visitorIdentityCtes},
${buildIdentifiedEventStream([step], filters, params)}
SELECT uniqExact(vid) AS completions FROM events`;
	const [row] = await chQuery<{ completions: number }>(query, params, {
		abort_signal: abortSignal,
	});
	return toFiniteNumber(row?.completions, 0);
};

// Main funnel analytics — step matching, timing, and aggregation happen in ClickHouse
export const processFunnelAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	visitorFilter?: Set<string>,
	abortSignal?: AbortSignal
): Promise<FunnelAnalytics> => {
	const totalSteps = steps.length;
	if (totalSteps === 0) {
		throw new Error("A funnel requires at least one step");
	}

	let visitorFilterClause = "";
	if (visitorFilter && visitorFilter.size > 0) {
		params.visitorFilterIds = [...visitorFilter];
		visitorFilterClause = " WHERE vid IN {visitorFilterIds:Array(String)}";
	}

	const candidateStepConditions = steps
		.map((_, index) =>
			index === 0
				? "event.step = 1 AND toDate(event.ts) = candidate.entry_date"
				: `event.step = ${index + 1}`
		)
		.join(", ");
	const fullQuery = `WITH ${visitorIdentityCtes},
${buildIdentifiedEventStream(steps, filters, params)},
filtered_events AS (
	SELECT DISTINCT step, vid, ts
	FROM events${visitorFilterClause}
),
entry_dates AS (
	SELECT DISTINCT vid, toDate(ts) AS entry_date
	FROM filtered_events
	WHERE step = 1
),
candidate_progress AS (
	SELECT
		candidate.vid AS vid,
		candidate.entry_date AS entry_date,
		windowFunnel(86400000)(
			toUInt64(toUnixTimestamp64Milli(event.ts)),
			${candidateStepConditions}
		) AS candidate_max_step
	FROM entry_dates candidate
	INNER JOIN filtered_events event ON event.vid = candidate.vid
	WHERE event.ts >= toDateTime(candidate.entry_date)
		AND event.ts < toDateTime(candidate.entry_date + INTERVAL 2 DAY)
	GROUP BY candidate.vid, candidate.entry_date
	HAVING candidate_max_step >= 1
),
visitor_progress AS (
	SELECT
		vid,
		argMax(
			entry_date,
			tuple(candidate_max_step, -toInt32(toRelativeDayNum(entry_date)))
		) AS entry_date,
		max(candidate_max_step) AS max_step
	FROM candidate_progress
	GROUP BY vid
	HAVING max_step >= 1
),
expanded AS (
	SELECT
		entry_date,
		max_step,
		arrayJoin(range(0, ${totalSteps + 2})) AS output_index
	FROM visitor_progress
)
SELECT
	toUInt8(output_index) AS step_num,
	if(output_index = 0, toString(entry_date), '') AS date,
	if(
		output_index = 0,
		count(),
		if(output_index <= ${totalSteps}, countIf(max_step >= output_index), toUInt64(0))
	) AS users,
	toFloat64(0) AS avg_time,
	if(output_index = 0, countIf(max_step >= ${totalSteps}), toUInt64(0)) AS conversions
FROM expanded
GROUP BY output_index, date
ORDER BY step_num, date`;

	const sentinelStep = totalSteps + 1;

	const aggRows = await chQuery<FunnelAggRow>(fullQuery, params, {
		abort_signal: abortSignal,
	});

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

	const stepsAnalytics: StepAnalytics[] = steps.map((s, i) => {
		const stepNum = i + 1;
		const row = stepRows.find((r) => r.step_num === stepNum);
		const users = toFiniteNumber(row?.users, 0);
		const prev =
			i > 0
				? toFiniteNumber(stepRows.find((r) => r.step_num === i)?.users, 0)
				: users;
		const drops = i > 0 ? prev - users : 0;

		return {
			step_number: stepNum,
			step_name: s.name,
			users,
			total_users: totalUsers,
			conversion_rate: i > 0 ? pct(users, prev) : users > 0 ? 100 : 0,
			dropoffs: drops,
			dropoff_rate: i > 0 ? pct(drops, prev) : 0,
			avg_time_to_complete: Math.round(toFiniteNumber(row?.avg_time, 0)),
			error_context_available: false,
			error_count: 0,
			error_rate: 0,
			top_errors: [],
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
		duration_available: false,
		steps_analytics: stepsAnalytics,
		time_series: timeSeries.length > 0 ? timeSeries : undefined,
		error_insights: {
			available: false,
			total_errors: 0,
			sessions_with_errors: 0,
			dropoffs_with_errors: 0,
			error_correlation_rate: 0,
		},
	};
};

export const processGoalAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: ClickhouseQueryParams,
	totalWebsiteUsers: number,
	abortSignal?: AbortSignal
): Promise<FunnelAnalytics> => {
	const step = steps[0];
	if (!step) {
		throw new Error("A goal requires one step");
	}
	const completions = await processGoalConversionCount(
		step,
		filters,
		params,
		abortSignal
	);

	return {
		overall_conversion_rate: pct(completions, totalWebsiteUsers),
		total_users_entered: totalWebsiteUsers,
		total_users_completed: completions,
		avg_completion_time: 0,
		avg_completion_time_formatted: "—",
		biggest_dropoff_step: 1,
		biggest_dropoff_rate: 0,
		duration_available: false,
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
				error_context_available: false,
				error_count: 0,
				error_rate: 0,
				top_errors: [],
			},
		],
		error_insights: {
			available: false,
			total_errors: 0,
			sessions_with_errors: 0,
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
	const totalSteps = steps.length;
	if (totalSteps === 0) {
		return { referrer_analytics: [] };
	}
	const stepConditions = steps
		.map((_, index) => `step = ${index + 1}`)
		.join(", ");

	const fullQuery = `WITH ${visitorIdentityCtes},
${buildIdentifiedEventStream(steps, filters, params, { includeReferrer: true })},
step_events AS (SELECT DISTINCT step, vid, ts, ref FROM events)
SELECT
	vid,
	windowFunnel(86400000)(toUInt64(toUnixTimestamp64Milli(ts)), ${stepConditions}) as max_step,
	argMinIf(ref, ts, step = 1) as referrer
FROM step_events
GROUP BY vid
HAVING max_step >= 1`;

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
	endDate: string,
	filters: Filter[] = [],
	abortSignal?: AbortSignal
): Promise<number> => {
	const params: ClickhouseQueryParams = {
		websiteId,
		startDate,
		endDate: DATE_ONLY_PATTERN.test(endDate) ? `${endDate} 23:59:59` : endDate,
	};
	const denominatorFilters = filters.filter(
		(filter) => filter.field !== "event_name"
	);
	const filterSQL = buildFilterSQL(denominatorFilters, params, "event");
	const eventVisitor = canonicalVisitorExpression("event", "event.time");
	const [result] = await chQuery<{ count: number }>(
		`WITH ${visitorIdentityCtes}
		 SELECT COUNT(DISTINCT ${eventVisitor}) as count
		 FROM analytics.events event${identityJoins("event")}
		 WHERE event.client_id = {websiteId:String}
			AND event.time >= parseDateTimeBestEffort({startDate:String})
			AND event.time <= parseDateTimeBestEffort({endDate:String})
			AND event.event_name = 'screen_view'
			AND ${eventVisitor} != ''${filterSQL}`,
		params,
		{ abort_signal: abortSignal }
	);
	return result?.count ?? 0;
};
