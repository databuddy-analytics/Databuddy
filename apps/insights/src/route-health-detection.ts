import { executeQuery } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	INSIGHT_VITALS,
	makeWowSignal,
	wowWindow,
} from "./detection";

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

export type RouteHealthQuery = (
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
