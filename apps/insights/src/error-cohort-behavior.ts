import { executeQuery, type Filter } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";

const MIN_MATCHED_ERROR_SESSIONS = 10;
const MIN_MATCHED_COVERAGE_PERCENT = 80;
const MIN_CONTINUATION_GAP_PERCENTAGE_POINTS = 15;

export interface ErrorCohortBehavior {
	affectedNextPagePercent: number;
	comparisonNextPagePercent: number;
	eligibleErrorSessions: number;
	matchedCoveragePercent: number;
	matchedErrorSessions: number;
	matchedPeerSessionObservations: number;
	matchedStrata: number;
}

/**
 * A bounded, aggregate-only comparison we can render as observed session
 * behavior. It intentionally does not infer bounce, retention, task failure,
 * or why the matched cohorts differed.
 */
export interface ObservedPostErrorContinuation {
	affectedPercent: number;
	comparisonPercent: number;
	differencePercentagePoints: number;
	horizonMinutes: 30;
	kind: "post_error_continuation";
	matchedErrorSessions: number;
}

type BehaviorQuery = typeof executeQuery;

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
		throw new Error(`Invalid ${field} in error cohort behavior result`);
	}
	return value;
}

function percentField(row: Record<string, unknown>, field: string): number {
	const value = numberField(row, field, { integer: false });
	if (value > 100) {
		throw new Error(`Invalid ${field} in error cohort behavior result`);
	}
	return value;
}

function expectedCoveragePercent(
	matchedErrorSessions: number,
	eligibleErrorSessions: number
): number {
	if (eligibleErrorSessions === 0) {
		return 0;
	}
	return Math.round((matchedErrorSessions / eligibleErrorSessions) * 1000) / 10;
}

export function parseErrorCohortBehavior(
	row: Record<string, unknown> | undefined
): ErrorCohortBehavior | null {
	if (!row) {
		return null;
	}
	const result: ErrorCohortBehavior = {
		affectedNextPagePercent: percentField(row, "affected_next_page_percent"),
		comparisonNextPagePercent: percentField(
			row,
			"comparison_next_page_percent"
		),
		eligibleErrorSessions: numberField(row, "eligible_error_sessions"),
		matchedCoveragePercent: percentField(row, "matched_coverage_percent"),
		matchedErrorSessions: numberField(row, "matched_error_sessions"),
		matchedPeerSessionObservations: numberField(
			row,
			"matched_peer_session_observations"
		),
		matchedStrata: numberField(row, "matched_strata"),
	};
	if (
		result.matchedErrorSessions > result.eligibleErrorSessions ||
		result.matchedStrata > result.matchedErrorSessions ||
		(result.matchedErrorSessions === 0 && result.matchedStrata !== 0) ||
		(result.matchedErrorSessions > 0 && result.matchedStrata === 0) ||
		(result.matchedStrata === 0 &&
			result.matchedPeerSessionObservations !== 0) ||
		(result.matchedErrorSessions === 0 &&
			(result.affectedNextPagePercent !== 0 ||
				result.comparisonNextPagePercent !== 0)) ||
		result.matchedPeerSessionObservations < result.matchedStrata * 10
	) {
		throw new Error("Inconsistent error cohort behavior result");
	}
	if (
		Math.abs(
			result.matchedCoveragePercent -
				expectedCoveragePercent(
					result.matchedErrorSessions,
					result.eligibleErrorSessions
				)
		) > 0.05
	) {
		throw new Error("Inconsistent error cohort behavior coverage");
	}
	if (
		result.matchedErrorSessions < MIN_MATCHED_ERROR_SESSIONS ||
		result.matchedCoveragePercent < MIN_MATCHED_COVERAGE_PERCENT
	) {
		return null;
	}
	return result;
}

function exactErrorFilter(signal: InvestigationSignal): Filter | null {
	if (signal.signalKey.startsWith("error:") && signal.entity.type === "error") {
		return { field: "message", op: "eq", value: signal.entity.id };
	}
	if (
		signal.signalKey.startsWith("route:error:") &&
		signal.entity.type === "page"
	) {
		return { field: "path", op: "eq", value: signal.entity.id };
	}
	return null;
}

export async function loadErrorCohortBehavior(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: BehaviorQuery = executeQuery
): Promise<ErrorCohortBehavior | null> {
	const filter = exactErrorFilter(params.signal);
	if (!filter || params.signal.metric.current === 0) {
		return null;
	}
	const rows = await query(
		{
			filters: [filter],
			from: params.signal.period.current.from,
			projectId: params.websiteId,
			to: params.signal.period.current.to,
			type: "error_cohort_behavior",
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	);
	return parseErrorCohortBehavior(rows[0]);
}

function countLabel(value: number, singular: string): string {
	return `${value.toLocaleString("en-US")} ${singular}${value === 1 ? "" : "s"}`;
}

function percentLabel(value: number): string {
	return `${value.toFixed(1)}%`;
}

function continuationGapPercentagePoints(
	behavior: ErrorCohortBehavior
): number {
	return (
		Math.round(
			(behavior.comparisonNextPagePercent - behavior.affectedNextPagePercent) *
				10
		) / 10
	);
}

/**
 * Returns a user-visible behavior fact only when the already-qualified cohort
 * has a material continuation drop. A positive gap is association, not cause.
 */
export function observedPostErrorContinuation(
	behavior: ErrorCohortBehavior
): ObservedPostErrorContinuation | null {
	const differencePercentagePoints = continuationGapPercentagePoints(behavior);
	if (differencePercentagePoints < MIN_CONTINUATION_GAP_PERCENTAGE_POINTS) {
		return null;
	}
	return {
		affectedPercent: behavior.affectedNextPagePercent,
		comparisonPercent: behavior.comparisonNextPagePercent,
		differencePercentagePoints,
		horizonMinutes: 30,
		kind: "post_error_continuation",
		matchedErrorSessions: behavior.matchedErrorSessions,
	};
}

export function observedPostErrorContinuationImpact(
	continuation: ObservedPostErrorContinuation
): string {
	return `In ${countLabel(continuation.matchedErrorSessions, "matched error session")}, ${percentLabel(continuation.affectedPercent)} reached another tracked page within ${continuation.horizonMinutes} minutes versus ${percentLabel(continuation.comparisonPercent)} of comparable visits; this association is not causal.`;
}

export function errorCohortBehaviorEvidence(
	behavior: ErrorCohortBehavior
): string {
	const difference = Math.abs(
		behavior.comparisonNextPagePercent - behavior.affectedNextPagePercent
	).toFixed(1);
	const direction =
		behavior.affectedNextPagePercent < behavior.comparisonNextPagePercent
			? "lower"
			: behavior.affectedNextPagePercent > behavior.comparisonNextPagePercent
				? "higher"
				: null;
	const comparison = direction
		? `${difference} percentage points ${direction} than comparable same-day visits`
		: "the same as comparable same-day visits";
	return `Post-error continuation was ${comparison} across ${countLabel(behavior.matchedErrorSessions, "matched session")}; this is association, not causation.`;
}
