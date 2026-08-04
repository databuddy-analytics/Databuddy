import { executeQuery, type Filter } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	prepareInvestigation,
	signalKeyForDetectedSignal,
} from "./investigation";

export interface ErrorCandidateOverlap {
	/** Error rows that satisfy both the fingerprint and route selectors. */
	cooccurring: {
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	fingerprint: {
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	route: {
		errorOccurrences: number;
		sessions: number;
		visitorIdentifiers: number;
	};
	sessionOverlapMeasurable: boolean;
	/** Exact intersection of the two full candidate cohorts. */
	shared: {
		sessions: number;
		visitorIdentifiers: number;
	};
	visitorOverlapMeasurable: boolean;
}

/**
 * A route is only folded into a broad error when the broad failure explains
 * most of that route's failures and nearly all of the affected people. This
 * leaves genuinely route-specific cohorts in the review.
 */
export const ERROR_ROUTE_MIN_DIRECT_ERROR_RATIO = 0.5;
export const ERROR_ROUTE_MIN_SHARED_VISITOR_RATIO = 0.8;
export const ERROR_ROUTE_MAX_MARGINAL_VISITORS = 4;

export type ErrorCandidateOverlapDecision =
	| "independent"
	| "redundant"
	| "unavailable";

export interface ErrorCandidateClustering {
	candidatePairCount: number;
	independentRouteSignalKeys: string[];
	measuredPairCount: number;
	redundantRouteSignalKeys: string[];
	unavailablePairCount: number;
}

/**
 * Private measured receipt for a route whose cohort is covered by one exact
 * broad error candidate. This is kept out of the public clustering summary so
 * it can guide the selected broad investigation without changing audit output.
 */
export interface ErrorCandidateRedundantRouteReceipt {
	fingerprintSignalKey: string;
	route: InvestigationSignal;
	routeSignalKey: string;
}

/** Internal trace used to cache and merge repeated portfolio passes. */
export interface ErrorCandidateClusteringTrace
	extends ErrorCandidateClustering {
	candidatePairKeys: string[];
	measuredPairKeys: string[];
	redundantRouteReceipts: ErrorCandidateRedundantRouteReceipt[];
	unavailablePairKeys: string[];
}

type OverlapQuery = typeof executeQuery;

function numberField(row: Record<string, unknown>, field: string): number {
	const value = Number(row[field]);
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Invalid ${field} in error candidate overlap result`);
	}
	return value;
}

function booleanField(row: Record<string, unknown>, field: string): boolean {
	const value = row[field];
	if (value === true || value === 1 || value === "1") {
		return true;
	}
	if (value === false || value === 0 || value === "0") {
		return false;
	}
	throw new Error(`Invalid ${field} in error candidate overlap result`);
}

function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

export function parseErrorCandidateOverlap(
	row: Record<string, unknown> | undefined
): ErrorCandidateOverlap | null {
	if (!row) {
		return null;
	}
	const overlap: ErrorCandidateOverlap = {
		cooccurring: {
			errorOccurrences: numberField(row, "cooccurring_error_occurrences"),
			sessions: numberField(row, "cooccurring_sessions"),
			visitorIdentifiers: numberField(row, "cooccurring_visitor_identifiers"),
		},
		fingerprint: {
			errorOccurrences: numberField(row, "fingerprint_error_occurrences"),
			sessions: numberField(row, "fingerprint_sessions"),
			visitorIdentifiers: numberField(row, "fingerprint_visitor_identifiers"),
		},
		route: {
			errorOccurrences: numberField(row, "route_error_occurrences"),
			sessions: numberField(row, "route_sessions"),
			visitorIdentifiers: numberField(row, "route_visitor_identifiers"),
		},
		sessionOverlapMeasurable: booleanField(row, "session_overlap_measurable"),
		shared: {
			sessions: numberField(row, "shared_sessions"),
			visitorIdentifiers: numberField(row, "shared_visitor_identifiers"),
		},
		visitorOverlapMeasurable: booleanField(row, "visitor_overlap_measurable"),
	};

	invariant(
		overlap.cooccurring.errorOccurrences <=
			Math.min(
				overlap.fingerprint.errorOccurrences,
				overlap.route.errorOccurrences
			),
		"Inconsistent error candidate overlap occurrences"
	);
	invariant(
		overlap.shared.sessions <=
			Math.min(overlap.fingerprint.sessions, overlap.route.sessions) &&
			overlap.cooccurring.sessions <= overlap.shared.sessions,
		"Inconsistent error candidate overlap sessions"
	);
	invariant(
		overlap.shared.visitorIdentifiers <=
			Math.min(
				overlap.fingerprint.visitorIdentifiers,
				overlap.route.visitorIdentifiers
			) &&
			overlap.cooccurring.visitorIdentifiers <=
				overlap.shared.visitorIdentifiers,
		"Inconsistent error candidate overlap visitor identifiers"
	);
	invariant(
		overlap.sessionOverlapMeasurable ===
			(overlap.fingerprint.sessions > 0 && overlap.route.sessions > 0),
		"Inconsistent error candidate session overlap coverage"
	);
	invariant(
		overlap.visitorOverlapMeasurable ===
			(overlap.fingerprint.visitorIdentifiers > 0 &&
				overlap.route.visitorIdentifiers > 0),
		"Inconsistent error candidate visitor overlap coverage"
	);
	return overlap;
}

function exactFingerprintFilter(signal: InvestigationSignal): Filter | null {
	if (
		!(signal.signalKey.startsWith("error:") && signal.entity.type === "error")
	) {
		return null;
	}
	return { field: "message", op: "eq", value: signal.entity.id };
}

function exactRouteFilter(signal: InvestigationSignal): Filter | null {
	if (
		!(
			signal.signalKey.startsWith("route:error:") &&
			signal.entity.type === "page"
		)
	) {
		return null;
	}
	return { field: "path", op: "eq", value: signal.entity.id };
}

export function isFingerprintErrorCandidate(signal: DetectedSignal): boolean {
	return (
		signal.metric === "error_count" &&
		signal.subjectKey?.startsWith("error:") === true
	);
}

export function isRouteErrorCandidate(signal: DetectedSignal): boolean {
	return (
		signal.metric === "error_count" &&
		signal.subjectKey?.startsWith("route:error:") === true
	);
}

function overlapPairKey(
	fingerprint: DetectedSignal,
	route: DetectedSignal
): string {
	return [
		signalKeyForDetectedSignal(fingerprint),
		signalKeyForDetectedSignal(route),
	].join("\u0000");
}

/**
 * Decides whether a route-specific error adds enough independent exposure to
 * deserve its own turn. A failed or incomparable measurement fails open.
 */
export function classifyErrorCandidateOverlap(params: {
	fingerprint: DetectedSignal;
	overlap: ErrorCandidateOverlap;
	route: DetectedSignal;
}): ErrorCandidateOverlapDecision {
	const { fingerprint, overlap, route } = params;
	if (
		!overlap.visitorOverlapMeasurable ||
		overlap.route.visitorIdentifiers === 0 ||
		overlap.route.errorOccurrences === 0 ||
		fingerprint.reach?.unit !== "visitor_identifiers" ||
		route.reach?.unit !== "visitor_identifiers" ||
		fingerprint.reach.current !== overlap.fingerprint.visitorIdentifiers ||
		route.reach.current !== overlap.route.visitorIdentifiers ||
		fingerprint.current !== overlap.fingerprint.errorOccurrences ||
		route.current !== overlap.route.errorOccurrences
	) {
		return "unavailable";
	}
	const sharedVisitorRatio =
		overlap.shared.visitorIdentifiers / overlap.route.visitorIdentifiers;
	const directErrorRatio =
		overlap.cooccurring.errorOccurrences / overlap.route.errorOccurrences;
	const marginalVisitors =
		overlap.route.visitorIdentifiers - overlap.shared.visitorIdentifiers;
	return sharedVisitorRatio >= ERROR_ROUTE_MIN_SHARED_VISITOR_RATIO &&
		directErrorRatio >= ERROR_ROUTE_MIN_DIRECT_ERROR_RATIO &&
		marginalVisitors <= ERROR_ROUTE_MAX_MARGINAL_VISITORS
		? "redundant"
		: "independent";
}

export async function loadErrorCandidateOverlap(
	params: {
		abortSignal?: AbortSignal;
		fingerprint: InvestigationSignal;
		route: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: OverlapQuery = executeQuery
): Promise<ErrorCandidateOverlap | null> {
	const fingerprintFilter = exactFingerprintFilter(params.fingerprint);
	const routeFilter = exactRouteFilter(params.route);
	if (
		!(fingerprintFilter && routeFilter) ||
		params.fingerprint.period.current.from !==
			params.route.period.current.from ||
		params.fingerprint.period.current.to !== params.route.period.current.to
	) {
		return null;
	}
	const rows = await query(
		{
			filters: [fingerprintFilter, routeFilter],
			from: params.fingerprint.period.current.from,
			projectId: params.websiteId,
			to: params.fingerprint.period.current.to,
			type: "error_candidate_overlap",
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	);
	return parseErrorCandidateOverlap(rows[0]);
}

/**
 * Measures only an already-bounded candidate portfolio, then marks route
 * cohorts that are demonstrably represented by one of its broad error
 * candidates. It never drops a due recheck and treats absent evidence as a
 * reason to retain the route.
 */
export async function clusterErrorCandidateRoutes(params: {
	abortSignal?: AbortSignal;
	candidates: readonly DetectedSignal[];
	dueSignalKey?: string | null;
	loadOverlap?: typeof loadErrorCandidateOverlap;
	lookbackDays: number;
	overlapCache?: Map<string, Promise<ErrorCandidateOverlap | null>>;
	timezone: string;
	websiteId: string;
}): Promise<ErrorCandidateClusteringTrace> {
	const loadOverlap = params.loadOverlap ?? loadErrorCandidateOverlap;
	const fingerprints = params.candidates
		.filter(isFingerprintErrorCandidate)
		.sort((left, right) =>
			signalKeyForDetectedSignal(left).localeCompare(
				signalKeyForDetectedSignal(right)
			)
		);
	const routes = params.candidates
		.filter(
			(signal) =>
				isRouteErrorCandidate(signal) &&
				signalKeyForDetectedSignal(signal) !== params.dueSignalKey
		)
		.sort((left, right) =>
			signalKeyForDetectedSignal(left).localeCompare(
				signalKeyForDetectedSignal(right)
			)
		);
	const pairs = fingerprints.flatMap((fingerprint) =>
		routes.map((route) => ({
			fingerprint,
			key: overlapPairKey(fingerprint, route),
			route,
		}))
	);
	const results = await Promise.all(
		pairs.map(async ({ fingerprint, key, route }) => {
			const cached = params.overlapCache?.get(key);
			const measurement =
				cached ??
				Promise.resolve()
					.then(() =>
						loadOverlap({
							abortSignal: params.abortSignal,
							fingerprint: prepareInvestigation(
								fingerprint,
								params.lookbackDays
							).signal,
							route: prepareInvestigation(route, params.lookbackDays).signal,
							timezone: params.timezone,
							websiteId: params.websiteId,
						})
					)
					.catch(() => null);
			if (!cached) {
				params.overlapCache?.set(key, measurement);
			}
			const overlap = await measurement;
			if (!overlap) {
				return {
					decision: "unavailable" as const,
					fingerprint,
					key,
					route,
				};
			}
			return {
				decision: classifyErrorCandidateOverlap({
					fingerprint,
					overlap,
					route,
				}),
				fingerprint,
				key,
				route,
			};
		})
	);
	const redundant = new Set<string>();
	const redundantRouteReceipts = new Map<
		string,
		ErrorCandidateRedundantRouteReceipt
	>();
	const independent = new Set<string>();
	const measuredPairKeys = new Set<string>();
	const unavailablePairKeys = new Set<string>();
	let measuredPairCount = 0;
	let unavailablePairCount = 0;
	for (const result of results) {
		const routeKey = signalKeyForDetectedSignal(result.route);
		if (result.decision === "unavailable") {
			unavailablePairCount += 1;
			unavailablePairKeys.add(result.key);
			continue;
		}
		measuredPairCount += 1;
		measuredPairKeys.add(result.key);
		if (result.decision === "redundant") {
			redundant.add(routeKey);
			const fingerprintSignalKey = signalKeyForDetectedSignal(
				result.fingerprint
			);
			redundantRouteReceipts.set(`${fingerprintSignalKey}\u0000${routeKey}`, {
				fingerprintSignalKey,
				route: prepareInvestigation(result.route, params.lookbackDays).signal,
				routeSignalKey: routeKey,
			});
		} else {
			independent.add(routeKey);
		}
	}
	return {
		candidatePairCount: pairs.length,
		candidatePairKeys: pairs.map((pair) => pair.key),
		independentRouteSignalKeys: [...independent]
			.filter((key) => !redundant.has(key))
			.sort(),
		measuredPairCount,
		measuredPairKeys: [...measuredPairKeys].sort(),
		redundantRouteReceipts: [...redundantRouteReceipts.values()].sort(
			(left, right) =>
				left.fingerprintSignalKey.localeCompare(right.fingerprintSignalKey) ||
				left.routeSignalKey.localeCompare(right.routeSignalKey)
		),
		redundantRouteSignalKeys: [...redundant].sort(),
		unavailablePairCount,
		unavailablePairKeys: [...unavailablePairKeys].sort(),
	};
}
