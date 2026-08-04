import { executeInsightsErrorCohortGoalCompletionQuery } from "@databuddy/ai/query";
import { and, db, eq, isNull } from "@databuddy/db";
import { goals, type DataFilter } from "@databuddy/db/schema";
import { normalizeGoalPathTarget } from "@databuddy/rpc/analytics-utils";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

const MIN_MATCHED_ERROR_SESSIONS = 10;
const MIN_MATCHED_COVERAGE_PERCENT = 80;
const MIN_COMPLETION_GAP_PERCENTAGE_POINTS = 15;

export interface ErrorCohortGoalCompletion {
	affectedCompletionPercent: number;
	affectedCompletionSessions: number;
	comparisonCompletionPercent: number;
	eligibleErrorSessions: number;
	matchedCoveragePercent: number;
	matchedErrorSessions: number;
	matchedPeerSessionObservations: number;
	matchedStrata: number;
}

export interface ConfiguredGoalTarget {
	target: string;
	type: "CUSTOM" | "EVENT" | "PAGE_VIEW";
}

interface GoalRow {
	createdAt: Date;
	filters: DataFilter[] | null;
	target: string;
	type: "CUSTOM" | "EVENT" | "PAGE_VIEW";
	updatedAt: Date;
}

export type ConfiguredGoalDefinition = GoalRow;

interface GoalTargetLookupParams {
	signal: InvestigationSignal;
	timezone: string;
	websiteId: string;
}

export interface ErrorCohortGoalCompletionDependencies {
	fetchConfiguredGoal?: (
		params: GoalTargetLookupParams
	) => Promise<ConfiguredGoalTarget | null>;
	query?: typeof executeInsightsErrorCohortGoalCompletionQuery;
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
		throw new Error(`Invalid ${field} in error cohort goal completion result`);
	}
	return value;
}

function percentField(row: Record<string, unknown>, field: string): number {
	const value = numberField(row, field, { integer: false });
	if (value > 100) {
		throw new Error(`Invalid ${field} in error cohort goal completion result`);
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

function expectedPercent(numerator: number, denominator: number): number {
	if (denominator === 0) {
		return 0;
	}
	return Math.round((numerator / denominator) * 1000) / 10;
}

export function parseErrorCohortGoalCompletion(
	row: Record<string, unknown> | undefined
): ErrorCohortGoalCompletion | null {
	if (!row) {
		return null;
	}
	const result: ErrorCohortGoalCompletion = {
		affectedCompletionPercent: percentField(row, "affected_completion_percent"),
		affectedCompletionSessions: numberField(
			row,
			"affected_completion_sessions"
		),
		comparisonCompletionPercent: percentField(
			row,
			"comparison_completion_percent"
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
		result.affectedCompletionSessions > result.matchedErrorSessions ||
		result.matchedStrata > result.matchedErrorSessions ||
		(result.matchedErrorSessions === 0 && result.matchedStrata !== 0) ||
		(result.matchedErrorSessions > 0 && result.matchedStrata === 0) ||
		(result.matchedStrata === 0 &&
			result.matchedPeerSessionObservations !== 0) ||
		(result.matchedErrorSessions === 0 &&
			(result.affectedCompletionSessions !== 0 ||
				result.affectedCompletionPercent !== 0 ||
				result.comparisonCompletionPercent !== 0)) ||
		result.matchedPeerSessionObservations < result.matchedStrata * 10
	) {
		throw new Error("Inconsistent error cohort goal completion result");
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
		throw new Error("Inconsistent error cohort goal completion coverage");
	}
	if (
		Math.abs(
			result.affectedCompletionPercent -
				expectedPercent(
					result.affectedCompletionSessions,
					result.matchedErrorSessions
				)
		) > 0.05
	) {
		throw new Error("Inconsistent error cohort goal completion percentage");
	}
	if (
		result.matchedErrorSessions < MIN_MATCHED_ERROR_SESSIONS ||
		result.matchedCoveragePercent < MIN_MATCHED_COVERAGE_PERCENT
	) {
		return null;
	}
	return result;
}

function exactErrorSelector(
	signal: InvestigationSignal
): { field: "message" | "path"; value: string } | null {
	if (!signal.entity.id.trim()) {
		return null;
	}
	if (signal.signalKey.startsWith("error:") && signal.entity.type === "error") {
		return { field: "message", value: signal.entity.id };
	}
	if (
		signal.signalKey.startsWith("route:error:") &&
		signal.entity.type === "page"
	) {
		return { field: "path", value: normalizeGoalPathTarget(signal.entity.id) };
	}
	return null;
}

function stableGoalTarget(
	goal: GoalRow,
	windowStart: Date
): ConfiguredGoalTarget | null {
	if (
		goal.filters?.length ||
		goal.createdAt > windowStart ||
		goal.updatedAt > windowStart ||
		!goal.target.trim()
	) {
		return null;
	}
	if (goal.type === "PAGE_VIEW") {
		return { target: normalizeGoalPathTarget(goal.target), type: goal.type };
	}
	if (goal.target !== goal.target.trim()) {
		return null;
	}
	return { target: goal.target, type: goal.type };
}

export function configuredGoalTargetFromDefinitions(
	definitions: readonly ConfiguredGoalDefinition[],
	params: Pick<GoalTargetLookupParams, "signal" | "timezone">
): ConfiguredGoalTarget | null {
	if (definitions.length !== 1) {
		return null;
	}
	const windowStart = dayjs
		.tz(params.signal.period.current.from, params.timezone)
		.startOf("day")
		.toDate();
	return stableGoalTarget(definitions[0], windowStart);
}

/**
 * A current configuration is usable only when it unambiguously supplies one
 * stable, unfiltered goal for the whole measured window. Choosing among
 * multiple definitions based on their observed difference would be an
 * arbitrary, outcome-driven comparison.
 */
export async function defaultConfiguredGoalTarget(
	params: GoalTargetLookupParams
): Promise<ConfiguredGoalTarget | null> {
	const rows = await db
		.select({
			createdAt: goals.createdAt,
			filters: goals.filters,
			target: goals.target,
			type: goals.type,
			updatedAt: goals.updatedAt,
		})
		.from(goals)
		.where(
			and(
				eq(goals.websiteId, params.websiteId),
				eq(goals.isActive, true),
				isNull(goals.deletedAt)
			)
		)
		.orderBy(goals.createdAt)
		.limit(2);
	return configuredGoalTargetFromDefinitions(rows as GoalRow[], params);
}

export async function loadErrorCohortGoalCompletion(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	dependencies: ErrorCohortGoalCompletionDependencies = {}
): Promise<ErrorCohortGoalCompletion | null> {
	const errorSelector = exactErrorSelector(params.signal);
	if (!errorSelector || params.signal.metric.current === 0) {
		return null;
	}
	const fetchConfiguredGoal =
		dependencies.fetchConfiguredGoal ?? defaultConfiguredGoalTarget;
	const configuredGoal = await fetchConfiguredGoal(params);
	if (!configuredGoal) {
		return null;
	}
	const query =
		dependencies.query ?? executeInsightsErrorCohortGoalCompletionQuery;
	const rows = await query(
		{
			errorSelector,
			from: params.signal.period.current.from,
			goalTarget: configuredGoal.target,
			goalType: configuredGoal.type,
			projectId: params.websiteId,
			to: params.signal.period.current.to,
			timezone: params.timezone,
		},
		undefined,
		params.timezone,
		params.abortSignal
	);
	return parseErrorCohortGoalCompletion(rows[0]);
}

function countLabel(value: number, singular: string): string {
	return `${value.toLocaleString("en-US")} ${singular}${value === 1 ? "" : "s"}`;
}

function percentLabel(value: number): string {
	return `${value.toFixed(1)}%`;
}

function errorSubject(signal: InvestigationSignal): string {
	return signal.signalKey.startsWith("route:error:")
		? "an error on this route"
		: "this error";
}

function completionGapPercentagePoints(
	completion: ErrorCohortGoalCompletion
): number {
	return (
		Math.round(
			(completion.comparisonCompletionPercent -
				completion.affectedCompletionPercent) *
				10
		) / 10
	);
}

/**
 * A lower target-reach rate is still only an association. This guard makes a
 * backend-owned impact available only for a sufficiently covered, material
 * difference and never turns normal configuration into an invented outcome.
 */
export function observedPostErrorGoalCompletion(
	completion: ErrorCohortGoalCompletion
): ErrorCohortGoalCompletion | null {
	return completionGapPercentagePoints(completion) >=
		MIN_COMPLETION_GAP_PERCENTAGE_POINTS
		? completion
		: null;
}

export function errorCohortGoalCompletionEvidence(
	completion: ErrorCohortGoalCompletion,
	signal: InvestigationSignal
): string {
	return `Among ${countLabel(completion.matchedErrorSessions, "matched session")}, ${percentLabel(completion.affectedCompletionPercent)} reached the configured completion within 30 minutes after ${errorSubject(signal)}, versus ${percentLabel(completion.comparisonCompletionPercent)} of comparable same-day visits; association, not causation.`;
}

export function observedPostErrorGoalCompletionImpact(
	completion: ErrorCohortGoalCompletion,
	signal: InvestigationSignal
): string {
	return `In ${countLabel(completion.matchedErrorSessions, "matched session")}, ${percentLabel(completion.affectedCompletionPercent)} reached the configured completion within 30 minutes after ${errorSubject(signal)}, versus ${percentLabel(completion.comparisonCompletionPercent)} of comparable same-day visits; the comparison is not causal.`;
}
