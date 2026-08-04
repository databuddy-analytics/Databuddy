import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	errorCohortBehaviorEvidence,
	loadErrorCohortBehavior,
	observedPostErrorContinuation,
	observedPostErrorContinuationImpact,
	parseErrorCohortBehavior,
} from "./error-cohort-behavior";

const errorSignal: InvestigationSignal = {
	changePercent: 56.5,
	entity: {
		id: "Manifest request failed",
		label: "Manifest request failure",
		type: "error",
	},
	metric: {
		current: 40,
		format: "number",
		label: "Manifest request failures",
		previous: 23,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	sentiment: "negative",
	severity: "warning",
	signalKey: "error:manifest-request-failed",
};

const row = {
	affected_next_page_percent: 20,
	comparison_next_page_percent: 55,
	eligible_error_sessions: 40,
	matched_coverage_percent: 85,
	matched_error_sessions: 34,
	matched_peer_session_observations: 380,
	matched_strata: 4,
};

describe("error cohort behavior", () => {
	it("summarizes a sufficiently covered route/day-matched comparison concisely", () => {
		const behavior = parseErrorCohortBehavior(row);

		expect(behavior).toEqual({
			affectedNextPagePercent: 20,
			comparisonNextPagePercent: 55,
			eligibleErrorSessions: 40,
			matchedCoveragePercent: 85,
			matchedErrorSessions: 34,
			matchedPeerSessionObservations: 380,
			matchedStrata: 4,
		});
		if (!behavior) {
			throw new Error("Expected cohort behavior fixture");
		}
		const cases = [
			[
				behavior,
				"Post-error continuation was 35.0 percentage points lower than comparable same-day visits across 34 matched sessions; this is association, not causation.",
			],
			[
				{
					...behavior,
					affectedNextPagePercent: 70,
					comparisonNextPagePercent: 55,
				},
				"Post-error continuation was 15.0 percentage points higher than comparable same-day visits across 34 matched sessions; this is association, not causation.",
			],
			[
				{
					...behavior,
					affectedNextPagePercent: 55,
					comparisonNextPagePercent: 55,
				},
				"Post-error continuation was the same as comparable same-day visits across 34 matched sessions; this is association, not causation.",
			],
		] as const;
		for (const [comparison, expected] of cases) {
			const evidence = errorCohortBehaviorEvidence(comparison);
			expect(evidence).toBe(expected);
			expect(evidence.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
			for (const unsafeTerm of [
				"bounce",
				"caused",
				"retention",
				"task failure",
			]) {
				expect(evidence.toLowerCase()).not.toContain(unsafeTerm);
			}
		}
	});

	it("creates a bounded post-error behavior impact only for a material continuation drop", () => {
		const behavior = parseErrorCohortBehavior(row);
		if (!behavior) {
			throw new Error("Expected cohort behavior fixture");
		}
		const continuation = observedPostErrorContinuation(behavior);
		expect(continuation).toEqual({
			affectedPercent: 20,
			comparisonPercent: 55,
			differencePercentagePoints: 35,
			horizonMinutes: 30,
			kind: "post_error_continuation",
			matchedErrorSessions: 34,
		});
		if (!continuation) {
			throw new Error("Expected a material continuation comparison");
		}
		const impact = observedPostErrorContinuationImpact(continuation);
		expect(impact).toBe(
			"In 34 matched error sessions, 20.0% reached another tracked page within 30 minutes versus 55.0% of comparable visits; this association is not causal."
		);
		expect(impact.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
		for (const unsafeTerm of [
			"abandon",
			"bounce",
			"caused",
			"retention",
			"task failure",
		]) {
			expect(impact.toLowerCase()).not.toContain(unsafeTerm);
		}
		expect(
			observedPostErrorContinuation({
				...behavior,
				comparisonNextPagePercent: 30,
			})
		).toBeNull();
		expect(
			observedPostErrorContinuation({
				...behavior,
				comparisonNextPagePercent: behavior.affectedNextPagePercent,
			})
		).toBeNull();
	});

	it("rejects inconsistent aggregate coverage", () => {
		expect(() =>
			parseErrorCohortBehavior({
				...row,
				matched_coverage_percent: 84.9,
			})
		).toThrow("Inconsistent error cohort behavior coverage");
		expect(() =>
			parseErrorCohortBehavior({
				...row,
				matched_peer_session_observations: 39,
			})
		).toThrow("Inconsistent error cohort behavior result");
	});

	it("withholds sparse or weakly covered comparisons", () => {
		expect(
			parseErrorCohortBehavior({
				...row,
				eligible_error_sessions: 10,
				matched_coverage_percent: 90,
				matched_error_sessions: 9,
				matched_peer_session_observations: 10,
				matched_strata: 1,
			})
		).toBeNull();
		expect(
			parseErrorCohortBehavior({
				...row,
				eligible_error_sessions: 20,
				matched_coverage_percent: 75,
				matched_error_sessions: 15,
				matched_peer_session_observations: 20,
				matched_strata: 2,
			})
		).toBeNull();
	});

	it("binds only the selected exact error and current window", async () => {
		const calls: unknown[] = [];
		const behavior = await loadErrorCohortBehavior(
			{
				signal: errorSignal,
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (request) => {
				calls.push(request);
				return [row];
			}
		);

		expect(behavior?.matchedErrorSessions).toBe(34);
		expect(calls).toEqual([
			{
				filters: [
					{
						field: "message",
						op: "eq",
						value: "Manifest request failed",
					},
				],
				from: "2026-07-24",
				projectId: "site-1",
				to: "2026-07-30",
				type: "error_cohort_behavior",
				timezone: "UTC",
			},
		]);
		await expect(
			loadErrorCohortBehavior(
				{
					signal: {
						...errorSignal,
						entity: { id: "visitors", label: "Visitors", type: "website" },
						signalKey: "visitors",
					},
					timezone: "UTC",
					websiteId: "site-1",
				},
				async () => {
					throw new Error("Unsupported signal must not query behavior");
				}
			)
		).resolves.toBeNull();
	});
});
