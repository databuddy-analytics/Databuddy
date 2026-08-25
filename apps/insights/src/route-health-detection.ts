import { executeQuery } from "@databuddy/ai/query";
import { chQuery, TABLE_NAMES } from "@databuddy/db/clickhouse";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	INSIGHT_VITALS,
	makeWowSignal,
	wowWindow,
} from "./detection";
import {
	hasMaterialRouteContinuation,
	parseRouteContinuationComparison,
	type RouteContinuationComparison,
} from "./error-customer-impact";

// The query API caps limits at 1000; page through a bounded sample because
// dynamic routes are filtered after the aggregate query returns.
const ROUTE_QUERY_LIMIT = 1000;
const ROUTE_QUERY_MAX_PAGES = 5;
const MIN_ERROR_COUNT = 10;
const MIN_ERROR_DELTA = 5;
const MIN_ERROR_USERS = 5;
const MIN_ERROR_DELTA_PERCENT = 40;
const MIN_VITAL_SAMPLES = 20;
const MIN_VITAL_DELTA_PERCENT = 30;
const MIN_VITAL_ROUTE_CONTINUATION_COHORT = 50;
const MIN_VITAL_ROUTE_CONTINUATION_DROP_PERCENTAGE_POINTS = 20;
const MIN_VITAL_ROUTE_CONTINUATION_EXPOSED_MATCH_RATE = 0.6;
const MAX_ROUTE_LENGTH = 120;
const MAX_RAW_ROUTE_LENGTH = 2048;

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d.+-]*:\/\//i;
const QUERY_OR_FRAGMENT_PATTERN = /[?#]/;
const STATIC_ROUTE_SEGMENT_PATTERN = /^[a-z][a-z-]{0,47}$/;

const STATIC_ROUTE_SEGMENTS = new Set([
	"about",
	"account",
	"accounts",
	"analytics",
	"app",
	"auth",
	"billing",
	"blog",
	"checkout",
	"contact",
	"creations",
	"dashboard",
	"docs",
	"download",
	"explore",
	"features",
	"feed",
	"help",
	"home",
	"integrations",
	"login",
	"onboarding",
	"plans",
	"pricing",
	"privacy",
	"profile",
	"register",
	"reports",
	"search",
	"security",
	"settings",
	"sign-in",
	"sign-up",
	"signin",
	"signup",
	"status",
	"support",
	"team",
	"terms",
	"upgrade",
	"welcome",
]);

type RouteVital = keyof typeof INSIGHT_VITALS;
type RouteHealthQueryType = "errors_by_page" | "vitals_by_page";

const NORMALIZED_ROUTE_SQL =
	"if(trimRight(path(path), '/') = '', '/', trimRight(path(path), '/'))";

const ROUTE_VITAL_CONTINUATION_SQL = `
	WITH
		toDateTime({startDate:String}) AS period_start,
		toDateTime(concat({endDate:String}, ' 23:59:59')) AS period_end,
		period_end - INTERVAL 10 MINUTE AS latest_entry_at,
		route_views AS (
			SELECT
				session_id,
				time AS route_view_at,
				${NORMALIZED_ROUTE_SQL} AS route,
				toDate(time) AS route_day,
				lower(ifNull(device_type, 'unknown')) AS device_type,
				lower(ifNull(browser_name, 'unknown')) AS browser_name
			FROM ${TABLE_NAMES.events}
			WHERE client_id = {websiteId:String}
				AND event_name = 'screen_view'
				AND session_id != ''
				AND path != ''
				AND time >= period_start
				AND time <= latest_entry_at
				AND ${NORMALIZED_ROUTE_SQL} = {route:String}
		),
		qualified_vitals AS (
			SELECT
				vital.session_id,
				vital.timestamp AS vital_at,
				vital.metric_value,
				view.route,
				view.route_day,
				view.device_type,
				view.browser_name
			FROM ${TABLE_NAMES.web_vitals_spans} vital
			INNER JOIN route_views view
				ON vital.session_id = view.session_id
			WHERE vital.client_id = {websiteId:String}
				AND vital.session_id != ''
				AND vital.path != ''
				AND vital.timestamp >= period_start
				AND vital.timestamp <= latest_entry_at
				AND vital.metric_name = {metric:String}
				AND vital.metric_value > 0
				AND vital.metric_value <= {maxPlausible:Float64}
				AND ${NORMALIZED_ROUTE_SQL} = {route:String}
				AND vital.timestamp >= view.route_view_at
				AND vital.timestamp <= view.route_view_at + INTERVAL 30 SECOND
		),
		exposed_sessions AS (
			SELECT
				session_id,
				argMinIf(route, vital_at, metric_value >= {badThreshold:Float64}) AS route,
				argMinIf(route_day, vital_at, metric_value >= {badThreshold:Float64}) AS route_day,
				argMinIf(device_type, vital_at, metric_value >= {badThreshold:Float64}) AS device_type,
				argMinIf(browser_name, vital_at, metric_value >= {badThreshold:Float64}) AS browser_name,
				minIf(vital_at, metric_value >= {badThreshold:Float64}) AS outcome_at
			FROM qualified_vitals
			GROUP BY session_id
			HAVING countIf(metric_value >= {badThreshold:Float64}) > 0
		),
		control_sessions AS (
			SELECT
				session_id,
				argMin(route, vital_at) AS route,
				argMin(route_day, vital_at) AS route_day,
				argMin(device_type, vital_at) AS device_type,
				argMin(browser_name, vital_at) AS browser_name,
				min(vital_at) AS outcome_at
			FROM qualified_vitals
			GROUP BY session_id
			HAVING countIf(metric_value >= {badThreshold:Float64}) = 0
		),
		exposed_by_stratum AS (
			SELECT route, route_day, device_type, browser_name, count() AS sessions
			FROM exposed_sessions
			GROUP BY route, route_day, device_type, browser_name
		),
		controls_by_stratum AS (
			SELECT route, route_day, device_type, browser_name, count() AS sessions
			FROM control_sessions
			GROUP BY route, route_day, device_type, browser_name
		),
		ranked_exposed_sessions AS (
			SELECT
				exposed.*,
				row_number() OVER (
					PARTITION BY route, route_day, device_type, browser_name
					ORDER BY cityHash64(session_id)
				) AS rank_in_stratum
			FROM exposed_sessions exposed
		),
		ranked_control_sessions AS (
			SELECT
				control.*,
				row_number() OVER (
					PARTITION BY route, route_day, device_type, browser_name
					ORDER BY cityHash64(session_id)
				) AS rank_in_stratum
			FROM control_sessions control
		),
		matched_exposed_sessions AS (
			SELECT exposed.*
			FROM ranked_exposed_sessions exposed
			INNER JOIN controls_by_stratum control
				ON exposed.route = control.route
				AND exposed.route_day = control.route_day
				AND exposed.device_type = control.device_type
				AND exposed.browser_name = control.browser_name
			WHERE exposed.rank_in_stratum <= control.sessions
		),
		matched_control_sessions AS (
			SELECT control.*
			FROM ranked_control_sessions control
			INNER JOIN exposed_by_stratum exposed
				ON control.route = exposed.route
				AND control.route_day = exposed.route_day
				AND control.device_type = exposed.device_type
				AND control.browser_name = exposed.browser_name
			WHERE control.rank_in_stratum <= exposed.sessions
		),
		continued_exposed_sessions AS (
			SELECT DISTINCT exposed.session_id
			FROM ${TABLE_NAMES.events} event
			INNER JOIN matched_exposed_sessions exposed
				ON event.session_id = exposed.session_id
			WHERE event.client_id = {websiteId:String}
				AND event.event_name = 'screen_view'
				AND event.path != ''
				AND event.time >= period_start
				AND event.time <= period_end
				AND event.time > exposed.outcome_at
				AND event.time <= exposed.outcome_at + INTERVAL 10 MINUTE
				AND ${NORMALIZED_ROUTE_SQL} != exposed.route
		),
		continued_control_sessions AS (
			SELECT DISTINCT control.session_id
			FROM ${TABLE_NAMES.events} event
			INNER JOIN matched_control_sessions control
				ON event.session_id = control.session_id
			WHERE event.client_id = {websiteId:String}
				AND event.event_name = 'screen_view'
				AND event.path != ''
				AND event.time >= period_start
				AND event.time <= period_end
				AND event.time > control.outcome_at
				AND event.time <= control.outcome_at + INTERVAL 10 MINUTE
				AND ${NORMALIZED_ROUTE_SQL} != control.route
		)
	SELECT
		toUInt64((SELECT count() FROM exposed_sessions)) AS candidate_exposed_sessions,
		toUInt64((SELECT count() FROM control_sessions)) AS candidate_control_sessions,
		toUInt64((SELECT count() FROM matched_exposed_sessions)) AS matched_exposed_sessions,
		toUInt64((SELECT count() FROM matched_control_sessions)) AS matched_control_sessions,
		toUInt64((SELECT count() FROM exposed_sessions))
			- toUInt64((SELECT count() FROM matched_exposed_sessions)) AS unmatched_exposed_sessions,
		toUInt64((SELECT count() FROM control_sessions))
			- toUInt64((SELECT count() FROM matched_control_sessions)) AS unmatched_control_sessions,
		toUInt64((SELECT count() FROM continued_exposed_sessions)) AS exposed_continued_sessions,
		toUInt64((SELECT count() FROM continued_control_sessions)) AS control_continued_sessions,
		if(
			(SELECT count() FROM matched_exposed_sessions) = 0,
			0,
			round(
				100 * (SELECT count() FROM continued_exposed_sessions)
					/ (SELECT count() FROM matched_exposed_sessions),
				1
			)
		) AS exposed_continuation_percent,
		if(
			(SELECT count() FROM matched_control_sessions) = 0,
			0,
			round(
				100 * (SELECT count() FROM continued_control_sessions)
					/ (SELECT count() FROM matched_control_sessions),
				1
			)
		) AS control_continuation_percent
`;

export interface RouteHealthQueryInput {
	filters?: Array<{ field: "path"; op: "eq"; value: string }>;
	from: string;
	limit: number;
	offset?: number;
	projectId: string;
	timezone: string;
	to: string;
	type: RouteHealthQueryType;
}

type RouteHealthQuery = (
	input: RouteHealthQueryInput,
	abortSignal?: AbortSignal
) => Promise<Record<string, unknown>[]>;

export interface RouteHealthDetectionDeps {
	query?: RouteHealthQuery;
}

interface RouteErrors {
	errors: number;
	users: number;
}

interface RouteVitalValue {
	p75: number;
	samples: number;
}

interface RouteSignalSpec {
	kind: "error" | "vital";
	metric?: RouteVital;
	route: string;
}

function defaultQuery(
	input: RouteHealthQueryInput,
	abortSignal?: AbortSignal
): Promise<Record<string, unknown>[]> {
	return executeQuery(input, undefined, input.timezone, abortSignal);
}

function finiteNumber(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function positiveNumber(value: unknown): number {
	const number = finiteNumber(value);
	return number > 0 ? number : 0;
}

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Keep a route only when every segment belongs to a fixed static vocabulary.
 * Dynamic values are rejected rather than redacted so neither signal identity
 * nor evidence can accidentally retain a user, identifier, or query value.
 */
export function canonicalStaticRoute(value: string): string | null {
	if (value.length === 0 || value.length > MAX_RAW_ROUTE_LENGTH) {
		return null;
	}

	let pathname = value.trim();
	if (!pathname) {
		return null;
	}

	if (ABSOLUTE_URL_PATTERN.test(pathname)) {
		try {
			pathname = new URL(pathname).pathname;
		} catch {
			return null;
		}
	}

	pathname = pathname.split(QUERY_OR_FRAGMENT_PATTERN, 1)[0] ?? "";
	if (pathname === "/") {
		return pathname;
	}
	if (
		!pathname.startsWith("/") ||
		pathname.startsWith("//") ||
		pathname.length > MAX_ROUTE_LENGTH
	) {
		return null;
	}

	const segments = pathname.split("/").filter(Boolean);
	if (
		segments.length === 0 ||
		segments.some(
			(segment) =>
				!(
					STATIC_ROUTE_SEGMENT_PATTERN.test(segment) &&
					STATIC_ROUTE_SEGMENTS.has(segment)
				)
		)
	) {
		return null;
	}

	return `/${segments.join("/")}`;
}

interface RouteVitalTarget {
	metric: RouteVital;
	route: string;
}

interface RouteVitalContinuationQueryInput extends RouteVitalTarget {
	abortSignal?: AbortSignal;
	badThreshold: number;
	from: string;
	maxPlausible: number;
	to: string;
	websiteId: string;
}

type RouteVitalContinuationQuery = (
	input: RouteVitalContinuationQueryInput
) => Promise<Record<string, unknown>[]>;

export interface RouteVitalContinuation {
	comparison: RouteContinuationComparison;
	metric: RouteVital;
	route: string;
}

const routeVitalContinuationPolicy = {
	minimumCohort: MIN_VITAL_ROUTE_CONTINUATION_COHORT,
	minimumExposedMatchRate: MIN_VITAL_ROUTE_CONTINUATION_EXPOSED_MATCH_RATE,
};

function routeVitalTarget(
	signal: InvestigationSignal
): RouteVitalTarget | null {
	const targets: { metric: RouteVital; prefix: string }[] = [
		{ metric: "LCP", prefix: "route:lcp:" },
		{ metric: "INP", prefix: "route:inp:" },
	];
	for (const target of targets) {
		if (!signal.signalKey.startsWith(target.prefix)) {
			continue;
		}
		const route = canonicalStaticRoute(
			signal.signalKey.slice(target.prefix.length)
		);
		if (
			!route ||
			signal.signalKey !== `${target.prefix}${route}` ||
			signal.entity.type !== "page" ||
			signal.entity.id !== route
		) {
			return null;
		}
		const vital = INSIGHT_VITALS[target.metric];
		if (
			!Number.isFinite(signal.metric.current) ||
			signal.metric.current <= vital.badThreshold ||
			signal.metric.current > vital.maxPlausible
		) {
			return null;
		}
		return { metric: target.metric, route };
	}
	return null;
}

function queryRouteVitalContinuation(
	input: RouteVitalContinuationQueryInput
): Promise<Record<string, unknown>[]> {
	return chQuery<Record<string, unknown>>(
		ROUTE_VITAL_CONTINUATION_SQL,
		{
			badThreshold: input.badThreshold,
			endDate: input.to,
			maxPlausible: input.maxPlausible,
			metric: input.metric,
			route: input.route,
			startDate: input.from,
			websiteId: input.websiteId,
		},
		{
			abort_signal: input.abortSignal,
			readonly: true,
		}
	);
}

/**
 * Measures whether sessions with a poor vital continued differently from
 * otherwise comparable sessions. It deliberately returns no cohort members
 * and only qualifies a comparison when the matched aggregate is substantial.
 */
export async function loadRouteVitalContinuation(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		websiteId: string;
	},
	query: RouteVitalContinuationQuery = queryRouteVitalContinuation
): Promise<RouteVitalContinuation | null> {
	const target = routeVitalTarget(params.signal);
	if (!target) {
		return null;
	}
	const vital = INSIGHT_VITALS[target.metric];
	const rows = await query({
		abortSignal: params.abortSignal,
		badThreshold: vital.badThreshold,
		from: params.signal.period.current.from,
		maxPlausible: vital.maxPlausible,
		metric: target.metric,
		route: target.route,
		to: params.signal.period.current.to,
		websiteId: params.websiteId,
	});
	const comparison = parseRouteContinuationComparison(
		rows[0],
		routeVitalContinuationPolicy
	);
	if (!comparison) {
		return null;
	}
	if (
		!hasMaterialRouteContinuation(
			comparison,
			MIN_VITAL_ROUTE_CONTINUATION_DROP_PERCENTAGE_POINTS
		)
	) {
		return null;
	}
	return { comparison, ...target };
}

function vitalThreshold(metric: RouteVital): string {
	const value = INSIGHT_VITALS[metric].badThreshold;
	return metric === "LCP"
		? `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} s`
		: `${value.toLocaleString("en-US")} ms`;
}

export function routeVitalContinuationEvidence(
	continuation: RouteVitalContinuation
): string {
	const { comparison, metric, route } = continuation;
	const threshold = vitalThreshold(metric);
	return `Among ${comparison.exposedSessions.toLocaleString("en-US")} sessions with ${metric} at or above ${threshold} and ${comparison.controlSessions.toLocaleString("en-US")} matched sessions below ${threshold} on ${route}, matched on route, day, device, and browser, ${comparison.exposedContinuationPercent.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of high-${metric} sessions later viewed a different page within 10 minutes, versus ${comparison.controlContinuationPercent.toLocaleString("en-US", { maximumFractionDigits: 1 })}% of controls (${comparison.percentagePointDifference.toLocaleString("en-US", { maximumFractionDigits: 1 })} percentage points). This is an association, not proof that ${metric} caused the difference.`;
}

function routeFromRow(row: Record<string, unknown>): string | null {
	return canonicalStaticRoute(
		stringValue(row.page) ?? stringValue(row.name) ?? ""
	);
}

function groupErrors(
	rows: Record<string, unknown>[]
): Map<string, RouteErrors> {
	const grouped = new Map<string, RouteErrors>();
	for (const row of rows) {
		const route = routeFromRow(row);
		if (!route) {
			continue;
		}
		const current = grouped.get(route) ?? { errors: 0, users: 0 };
		grouped.set(route, {
			errors: current.errors + positiveNumber(row.errors),
			users: Math.max(current.users, positiveNumber(row.users)),
		});
	}
	return grouped;
}

function vitalFromRow(row: Record<string, unknown>): RouteVital | null {
	const value = stringValue(row.metric_name)?.toUpperCase();
	return value === "LCP" || value === "INP" ? value : null;
}

function groupVitals(
	rows: Record<string, unknown>[]
): Map<string, RouteVitalValue> {
	const grouped = new Map<string, RouteVitalValue>();
	for (const row of rows) {
		const route = routeFromRow(row);
		const metric = vitalFromRow(row);
		const p75 = positiveNumber(row.p75);
		const samples = positiveNumber(row.samples);
		if (!(route && metric) || p75 === 0 || samples === 0) {
			continue;
		}
		const key = `${metric}:${route}`;
		const previous = grouped.get(key);
		if (previous && previous.samples >= samples) {
			continue;
		}
		grouped.set(key, { p75, samples });
	}
	return grouped;
}

function routeEntityLabel(route: string): string {
	return `Route ${route}`;
}

function routeErrorSignal(params: {
	applyThreshold: boolean;
	baseline: RouteErrors;
	current: RouteErrors;
	detectedAt: string;
	route: string;
}): DetectedSignal | null {
	const delta =
		params.baseline.errors === 0
			? params.current.errors === 0
				? 0
				: 100
			: ((params.current.errors - params.baseline.errors) /
					params.baseline.errors) *
				100;
	if (
		params.applyThreshold &&
		(params.current.errors <= params.baseline.errors ||
			params.current.errors < MIN_ERROR_COUNT ||
			params.current.errors - params.baseline.errors < MIN_ERROR_DELTA ||
			params.current.users < MIN_ERROR_USERS ||
			delta < MIN_ERROR_DELTA_PERCENT)
	) {
		return null;
	}

	const signal = makeWowSignal(
		"error_count",
		`Errors on ${params.route}`,
		params.current.errors,
		params.baseline.errors,
		params.detectedAt
	);
	const isCritical =
		params.current.users >= 20 &&
		params.current.errors >= 20 &&
		signal.deltaPercent >= 60;
	return {
		...signal,
		definitionEvidence: `Route ${params.route} logged ${params.current.errors} errors across ${params.current.users} visitor identifiers, compared with ${params.baseline.errors} errors across ${params.baseline.users} visitor identifiers in the preceding period.`,
		entityId: params.route,
		entityLabel: routeEntityLabel(params.route),
		severity: params.applyThreshold
			? isCritical
				? "critical"
				: "warning"
			: signal.severity,
		subjectKey: `route:error:${params.route}`,
	};
}

function routeVitalSignal(params: {
	applyThreshold: boolean;
	baseline: RouteVitalValue;
	current: RouteVitalValue;
	detectedAt: string;
	metric: RouteVital;
	route: string;
}): DetectedSignal | null {
	const vital = INSIGHT_VITALS[params.metric];
	if (
		params.current.samples < MIN_VITAL_SAMPLES ||
		params.baseline.samples < MIN_VITAL_SAMPLES ||
		params.current.p75 > vital.maxPlausible ||
		params.baseline.p75 > vital.maxPlausible
	) {
		return null;
	}
	const delta =
		((params.current.p75 - params.baseline.p75) / params.baseline.p75) * 100;
	if (
		params.applyThreshold &&
		(params.current.p75 <= params.baseline.p75 ||
			params.current.p75 <= vital.badThreshold ||
			delta < MIN_VITAL_DELTA_PERCENT)
	) {
		return null;
	}

	const metric = params.metric.toLowerCase();
	const signal = makeWowSignal(
		metric,
		`${vital.label} on ${params.route}`,
		params.current.p75,
		params.baseline.p75,
		params.detectedAt,
		{ round: true }
	);
	const isCritical = params.current.samples >= 100 && signal.deltaPercent >= 60;
	return {
		...signal,
		definitionEvidence: `Route ${params.route} recorded p75 ${params.metric} of ${signal.current} ms across ${params.current.samples} samples, compared with ${signal.baseline} ms across ${params.baseline.samples} samples in the preceding period.`,
		entityId: params.route,
		entityLabel: routeEntityLabel(params.route),
		severity: params.applyThreshold
			? isCritical
				? "critical"
				: "warning"
			: signal.severity,
		subjectKey: `route:${metric}:${params.route}`,
	};
}

function compareSignals(left: DetectedSignal, right: DetectedSignal): number {
	const severity = { critical: 2, warning: 1, info: 0 } as const;
	return (
		severity[right.severity] - severity[left.severity] ||
		Math.abs(right.deltaPercent) - Math.abs(left.deltaPercent) ||
		(left.subjectKey ?? left.metric).localeCompare(
			right.subjectKey ?? right.metric
		)
	);
}

function routeSignalSpec(prior: InvestigationSignal): RouteSignalSpec | null {
	const specs: {
		kind: RouteSignalSpec["kind"];
		metric?: RouteVital;
		prefix: string;
	}[] = [
		{ kind: "error", prefix: "route:error:" },
		{ kind: "vital", metric: "LCP", prefix: "route:lcp:" },
		{ kind: "vital", metric: "INP", prefix: "route:inp:" },
	];
	for (const spec of specs) {
		if (!prior.signalKey.startsWith(spec.prefix)) {
			continue;
		}
		const route = canonicalStaticRoute(
			prior.signalKey.slice(spec.prefix.length)
		);
		if (!route || `${spec.prefix}${route}` !== prior.signalKey) {
			return null;
		}
		return { ...spec, route };
	}
	return null;
}

function queryInput(params: {
	from: string;
	route?: string;
	to: string;
	type: RouteHealthQueryType;
	values: DetectSignalsParams;
}): RouteHealthQueryInput {
	return {
		...(params.route
			? {
					filters: [
						{ field: "path" as const, op: "eq" as const, value: params.route },
					],
				}
			: {}),
		from: params.from,
		limit: ROUTE_QUERY_LIMIT,
		projectId: params.values.websiteId,
		to: params.to,
		timezone: params.values.timezone,
		type: params.type,
	};
}

async function queryRouteHealthPages(
	query: RouteHealthQuery,
	input: RouteHealthQueryInput,
	abortSignal?: AbortSignal
): Promise<Record<string, unknown>[]> {
	const rows: Record<string, unknown>[] = [];
	for (let page = 1; page <= ROUTE_QUERY_MAX_PAGES; page += 1) {
		const pageRows = await query(
			page === 1
				? input
				: {
						...input,
						offset: (page - 1) * ROUTE_QUERY_LIMIT,
					},
			abortSignal
		);
		rows.push(...pageRows);
		if (pageRows.length < ROUTE_QUERY_LIMIT) {
			break;
		}
	}
	return rows;
}

/**
 * Detect high-confidence route regressions from aggregate error and web-vital
 * queries. It deliberately omits arbitrary routes rather than leaking a
 * potentially user-specific path into an investigation subject or evidence.
 */
export async function detectRouteHealthSignals(
	params: DetectSignalsParams,
	today: dayjs.Dayjs = dayjs(),
	dependencies: RouteHealthDetectionDeps = {},
	abortSignal?: AbortSignal
): Promise<DetectedSignal[]> {
	const query = dependencies.query ?? defaultQuery;
	const window = wowWindow(today, params.lookbackDays);
	const [currentErrors, previousErrors, currentVitals, previousVitals] =
		await Promise.all([
			queryRouteHealthPages(
				query,
				queryInput({
					from: window.currentFrom,
					to: window.currentTo,
					type: "errors_by_page",
					values: params,
				}),
				abortSignal
			),
			queryRouteHealthPages(
				query,
				queryInput({
					from: window.previousFrom,
					to: window.previousTo,
					type: "errors_by_page",
					values: params,
				}),
				abortSignal
			),
			queryRouteHealthPages(
				query,
				queryInput({
					from: window.currentFrom,
					to: window.currentTo,
					type: "vitals_by_page",
					values: params,
				}),
				abortSignal
			),
			queryRouteHealthPages(
				query,
				queryInput({
					from: window.previousFrom,
					to: window.previousTo,
					type: "vitals_by_page",
					values: params,
				}),
				abortSignal
			),
		]);

	const errorCurrent = groupErrors(currentErrors);
	const errorPrevious = groupErrors(previousErrors);
	const errorRoutes = new Set([
		...errorCurrent.keys(),
		...errorPrevious.keys(),
	]);
	const vitalCurrent = groupVitals(currentVitals);
	const vitalPrevious = groupVitals(previousVitals);
	const vitalKeys = new Set([...vitalCurrent.keys(), ...vitalPrevious.keys()]);
	const signals: DetectedSignal[] = [];

	for (const route of errorRoutes) {
		const signal = routeErrorSignal({
			applyThreshold: true,
			baseline: errorPrevious.get(route) ?? { errors: 0, users: 0 },
			current: errorCurrent.get(route) ?? { errors: 0, users: 0 },
			detectedAt: window.currentTo,
			route,
		});
		if (signal) {
			signals.push(signal);
		}
	}

	for (const key of vitalKeys) {
		const [metric, route] = key.split(":", 2) as [RouteVital, string];
		const current = vitalCurrent.get(key);
		const baseline = vitalPrevious.get(key);
		if (!(current && baseline)) {
			continue;
		}
		const signal = routeVitalSignal({
			applyThreshold: true,
			baseline,
			current,
			detectedAt: window.currentTo,
			metric,
			route,
		});
		if (signal) {
			signals.push(signal);
		}
	}

	return signals.sort(compareSignals);
}

/**
 * Re-read a stored static-route signal without its discovery thresholds so a
 * route case can record recovery. Sample plausibility floors still apply.
 */
export async function remeasureRouteHealthSignal(
	params: DetectSignalsParams,
	prior: InvestigationSignal,
	today: dayjs.Dayjs = dayjs(),
	dependencies: RouteHealthDetectionDeps = {},
	abortSignal?: AbortSignal
): Promise<DetectedSignal | null> {
	const spec = routeSignalSpec(prior);
	if (!spec) {
		return null;
	}
	const query = dependencies.query ?? defaultQuery;
	const window = wowWindow(today, params.lookbackDays);
	const type: RouteHealthQueryType =
		spec.kind === "error" ? "errors_by_page" : "vitals_by_page";
	const [currentRows, previousRows] = await Promise.all([
		queryRouteHealthPages(
			query,
			queryInput({
				from: window.currentFrom,
				to: window.currentTo,
				type,
				values: params,
			}),
			abortSignal
		),
		queryRouteHealthPages(
			query,
			queryInput({
				from: window.previousFrom,
				to: window.previousTo,
				type,
				values: params,
			}),
			abortSignal
		),
	]);

	if (spec.kind === "error") {
		const current = groupErrors(currentRows).get(spec.route) ?? {
			errors: 0,
			users: 0,
		};
		const baseline = groupErrors(previousRows).get(spec.route) ?? {
			errors: 0,
			users: 0,
		};
		return routeErrorSignal({
			applyThreshold: false,
			baseline,
			current,
			detectedAt: window.currentTo,
			route: spec.route,
		});
	}

	const key = `${spec.metric}:${spec.route}`;
	const current = groupVitals(currentRows).get(key);
	const baseline = groupVitals(previousRows).get(key);
	if (!(current && baseline && spec.metric)) {
		return null;
	}
	return routeVitalSignal({
		applyThreshold: false,
		baseline,
		current,
		detectedAt: window.currentTo,
		metric: spec.metric,
		route: spec.route,
	});
}
