import { executeInsightsVitalCohortBehaviorQuery } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import { INSIGHT_VITALS } from "./detection";
import { canonicalStaticRoute } from "./route-health-detection";

const MIN_MATCHED_SLOW_SESSIONS = 10;
const MIN_MATCHED_COVERAGE_PERCENT = 80;
const MIN_CONTINUATION_GAP_PERCENTAGE_POINTS = 15;
const ROUTE_VITAL_SIGNAL_PATTERN = /^route:(lcp|inp):(.+)$/;

export type VitalCohortMetric = "INP" | "LCP";

export interface VitalCohortBehavior {
	comparisonNextPagePercent: number;
	eligibleSlowSessions: number;
	matchedCoveragePercent: number;
	matchedPeerSessionObservations: number;
	matchedSlowSessions: number;
	matchedStrata: number;
	metric: VitalCohortMetric;
	slowNextPagePercent: number;
}

/**
 * A bounded, aggregate-only comparison between sessions with a slow route
 * vital and same-route/day sessions whose value stayed below the bad-vital
 * threshold. It never establishes why the cohorts differed.
 */
export interface ObservedPostSlowVitalContinuation {
	comparisonPercent: number;
	differencePercentagePoints: number;
	horizonMinutes: 30;
	kind: "post_slow_vital_continuation";
	matchedSlowSessions: number;
	slowPercent: number;
}

type VitalCohortBehaviorQuery = typeof executeInsightsVitalCohortBehaviorQuery;

interface ExactVitalSelector {
	metric: VitalCohortMetric;
	path: string;
	threshold: number;
}

function numberField(
	row: Record<string, unknown>,
	field: string,
	options: { integer?: boolean } = { integer: true }
): number {
	const value = Number(row[field]);
	if (
		!Number.isFinite(value) ||
		value < 0 ||
		(options.integer !== false && !Number.isInteger(value))
	) {
		throw new Error(`Invalid ${field} in vital cohort behavior result`);
	}
	return value;
}

function percentField(row: Record<string, unknown>, field: string): number {
	const value = numberField(row, field, { integer: false });
	if (value > 100) {
		throw new Error(`Invalid ${field} in vital cohort behavior result`);
	}
	return value;
}

function expectedCoveragePercent(
	matchedSlowSessions: number,
	eligibleSlowSessions: number
): number {
	if (eligibleSlowSessions === 0) {
		return 0;
	}
	return Math.round((matchedSlowSessions / eligibleSlowSessions) * 1000) / 10;
}

function exactVitalSelector(
	signal: InvestigationSignal
): ExactVitalSelector | null {
	const match = ROUTE_VITAL_SIGNAL_PATTERN.exec(signal.signalKey);
	if (
		!match ||
		signal.entity.type !== "page" ||
		signal.metric.format !== "duration_ms"
	) {
		return null;
	}
	const keyMetric = match[1]?.toUpperCase();
	if (keyMetric !== "LCP" && keyMetric !== "INP") {
		return null;
	}
	const path = canonicalStaticRoute(match[2] ?? "");
	if (
		!path ||
		`route:${keyMetric.toLowerCase()}:${path}` !== signal.signalKey ||
		canonicalStaticRoute(signal.entity.id) !== path ||
		signal.entity.id !== path
	) {
		return null;
	}
	const threshold = INSIGHT_VITALS[keyMetric].badThreshold;
	if (signal.metric.current < threshold) {
		return null;
	}
	return { metric: keyMetric, path, threshold };
}

function assertBehaviorMatchesSignal(
	behavior: VitalCohortBehavior,
	signal: InvestigationSignal
): ExactVitalSelector {
	const selector = exactVitalSelector(signal);
	if (!selector || selector.metric !== behavior.metric) {
		throw new Error("Vital cohort behavior did not match the selected vital");
	}
	return selector;
}

export function parseVitalCohortBehavior(
	row: Record<string, unknown> | undefined,
	metric: VitalCohortMetric
): VitalCohortBehavior | null {
	if (!row) {
		return null;
	}
	const result: VitalCohortBehavior = {
		comparisonNextPagePercent: percentField(
			row,
			"comparison_next_page_percent"
		),
		eligibleSlowSessions: numberField(row, "eligible_slow_sessions"),
		matchedCoveragePercent: percentField(row, "matched_coverage_percent"),
		matchedPeerSessionObservations: numberField(
			row,
			"matched_peer_session_observations"
		),
		matchedSlowSessions: numberField(row, "matched_slow_sessions"),
		matchedStrata: numberField(row, "matched_strata"),
		metric,
		slowNextPagePercent: percentField(row, "slow_next_page_percent"),
	};
	if (
		result.matchedSlowSessions > result.eligibleSlowSessions ||
		result.matchedStrata > result.matchedSlowSessions ||
		(result.matchedSlowSessions === 0 && result.matchedStrata !== 0) ||
		(result.matchedSlowSessions > 0 && result.matchedStrata === 0) ||
		(result.matchedStrata === 0 &&
			result.matchedPeerSessionObservations !== 0) ||
		(result.matchedSlowSessions === 0 &&
			(result.slowNextPagePercent !== 0 ||
				result.comparisonNextPagePercent !== 0)) ||
		result.matchedPeerSessionObservations < result.matchedStrata * 10
	) {
		throw new Error("Inconsistent vital cohort behavior result");
	}
	if (
		Math.abs(
			result.matchedCoveragePercent -
				expectedCoveragePercent(
					result.matchedSlowSessions,
					result.eligibleSlowSessions
				)
		) > 0.05
	) {
		throw new Error("Inconsistent vital cohort behavior coverage");
	}
	if (
		result.matchedSlowSessions < MIN_MATCHED_SLOW_SESSIONS ||
		result.matchedCoveragePercent < MIN_MATCHED_COVERAGE_PERCENT
	) {
		return null;
	}
	return result;
}

/**
 * Runs only for the exact static route LCP/INP signal selected for this
 * investigation. The private query returns aggregates; no session, visitor,
 * profile, or uncanonicalized route reaches the agent context.
 */
export async function loadVitalCohortBehavior(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: VitalCohortBehaviorQuery = executeInsightsVitalCohortBehaviorQuery
): Promise<VitalCohortBehavior | null> {
	const selector = exactVitalSelector(params.signal);
	if (!selector) {
		return null;
	}
	const rows = await query(
		{
			from: params.signal.period.current.from,
			path: selector.path,
			projectId: params.websiteId,
			to: params.signal.period.current.to,
			vitalMetric: selector.metric,
			vitalThreshold: selector.threshold,
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	);
	return parseVitalCohortBehavior(rows[0], selector.metric);
}

function countLabel(value: number, singular: string): string {
	return `${value.toLocaleString("en-US")} ${singular}${value === 1 ? "" : "s"}`;
}

function percentLabel(value: number): string {
	return `${value.toFixed(1)}%`;
}

function slowExperienceLabel(metric: VitalCohortMetric): string {
	return metric === "LCP" ? "a slow page load" : "a slow interaction response";
}

function continuationGapPercentagePoints(
	behavior: VitalCohortBehavior
): number {
	return (
		Math.round(
			(behavior.comparisonNextPagePercent - behavior.slowNextPagePercent) * 10
		) / 10
	);
}

/**
 * Returns an observed behavior fact only for a material continuation drop.
 * A positive gap remains an association rather than a product-causality
 * claim.
 */
export function observedPostSlowVitalContinuation(
	behavior: VitalCohortBehavior
): ObservedPostSlowVitalContinuation | null {
	const differencePercentagePoints = continuationGapPercentagePoints(behavior);
	if (differencePercentagePoints < MIN_CONTINUATION_GAP_PERCENTAGE_POINTS) {
		return null;
	}
	return {
		comparisonPercent: behavior.comparisonNextPagePercent,
		differencePercentagePoints,
		horizonMinutes: 30,
		kind: "post_slow_vital_continuation",
		matchedSlowSessions: behavior.matchedSlowSessions,
		slowPercent: behavior.slowNextPagePercent,
	};
}

export function observedPostSlowVitalContinuationImpact(
	continuation: ObservedPostSlowVitalContinuation,
	signal: InvestigationSignal
): string {
	const selector = exactVitalSelector(signal);
	if (!selector) {
		throw new Error(
			"Observed vital continuation requires an exact vital signal"
		);
	}
	return `In ${countLabel(continuation.matchedSlowSessions, "session")} with ${slowExperienceLabel(selector.metric)}, ${percentLabel(continuation.slowPercent)} reached another tracked page within ${continuation.horizonMinutes} minutes, versus ${percentLabel(continuation.comparisonPercent)} of same-route, same-day visits without ${slowExperienceLabel(selector.metric)}; the comparison is not causal.`;
}

export function vitalCohortBehaviorEvidence(
	behavior: VitalCohortBehavior,
	signal: InvestigationSignal
): string {
	const selector = assertBehaviorMatchesSignal(behavior, signal);
	return `Among ${countLabel(behavior.matchedSlowSessions, "matched session")} with ${slowExperienceLabel(selector.metric)}, ${percentLabel(behavior.slowNextPagePercent)} reached another tracked page in 30 minutes versus ${percentLabel(behavior.comparisonNextPagePercent)} of matched comparable visits (association, not causation).`;
}
