import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	loadVitalCohortBehavior,
	observedPostSlowVitalContinuation,
	observedPostSlowVitalContinuationImpact,
	parseVitalCohortBehavior,
	vitalCohortBehaviorEvidence,
} from "./vital-cohort-behavior";

const vitalSignal: InvestigationSignal = {
	changePercent: 56.5,
	entity: {
		id: "/explore",
		label: "Route /explore",
		type: "page",
	},
	metric: {
		current: 3600,
		format: "duration_ms",
		label: "Largest Contentful Paint on /explore",
		previous: 2300,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	severity: "warning",
	sentiment: "negative",
	signalKey: "route:lcp:/explore",
};

const row = {
	comparison_next_page_percent: 55,
	eligible_slow_sessions: 40,
	matched_coverage_percent: 85,
	matched_peer_session_observations: 380,
	matched_slow_sessions: 34,
	matched_strata: 4,
	slow_next_page_percent: 20,
};

describe("vital cohort behavior", () => {
	it("parses a sufficiently covered route/day-matched slow-vital comparison", () => {
		const behavior = parseVitalCohortBehavior(row, "LCP");

		expect(behavior).toEqual({
			comparisonNextPagePercent: 55,
			eligibleSlowSessions: 40,
			matchedCoveragePercent: 85,
			matchedPeerSessionObservations: 380,
			matchedSlowSessions: 34,
			matchedStrata: 4,
			metric: "LCP",
			slowNextPagePercent: 20,
		});
		if (!behavior) {
			throw new Error("Expected vital cohort behavior fixture");
		}
		const evidence = vitalCohortBehaviorEvidence(behavior, vitalSignal);
		expect(evidence).toContain(
			"20.0% reached another tracked page in 30 minutes versus 55.0%"
		);
		expect(evidence).toContain("association, not causation");
		expect(evidence.trim().split(/\s+/).length).toBeLessThanOrEqual(26);
		for (const unsafeTerm of [
			"bounce",
			"retention",
			"session_id",
			"abandon",
			"caused",
		]) {
			expect(evidence.toLowerCase()).not.toContain(unsafeTerm);
		}
	});

	it("creates a bounded post-slow-vital fact only for a material continuation drop", () => {
		const behavior = parseVitalCohortBehavior(row, "LCP");
		if (!behavior) {
			throw new Error("Expected vital cohort behavior fixture");
		}
		const continuation = observedPostSlowVitalContinuation(behavior);
		expect(continuation).toEqual({
			comparisonPercent: 55,
			differencePercentagePoints: 35,
			horizonMinutes: 30,
			kind: "post_slow_vital_continuation",
			matchedSlowSessions: 34,
			slowPercent: 20,
		});
		if (!continuation) {
			throw new Error("Expected a material continuation comparison");
		}
		const impact = observedPostSlowVitalContinuationImpact(
			continuation,
			vitalSignal
		);
		expect(impact).toContain(
			"20.0% reached another tracked page within 30 minutes, versus 55.0%"
		);
		expect(impact).toContain("the comparison is not causal");
		expect(impact.trim().split(/\s+/).length).toBeLessThanOrEqual(32);
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
			observedPostSlowVitalContinuation({
				...behavior,
				comparisonNextPagePercent: 30,
			})
		).toBeNull();
	});

	it("rejects inconsistent aggregate coverage and cross-metric evidence", () => {
		expect(() =>
			parseVitalCohortBehavior(
				{ ...row, matched_coverage_percent: 84.9 },
				"LCP"
			)
		).toThrow("Inconsistent vital cohort behavior coverage");
		expect(() =>
			parseVitalCohortBehavior(
				{ ...row, matched_peer_session_observations: 39 },
				"LCP"
			)
		).toThrow("Inconsistent vital cohort behavior result");
		const behavior = parseVitalCohortBehavior(row, "LCP");
		if (!behavior) {
			throw new Error("Expected vital cohort behavior fixture");
		}
		expect(() =>
			vitalCohortBehaviorEvidence(behavior, {
				...vitalSignal,
				metric: { ...vitalSignal.metric, current: 300 },
				signalKey: "route:inp:/explore",
			})
		).toThrow("Vital cohort behavior did not match the selected vital");
	});

	it("withholds sparse or weakly covered comparisons", () => {
		expect(
			parseVitalCohortBehavior(
				{
					...row,
					eligible_slow_sessions: 10,
					matched_coverage_percent: 90,
					matched_peer_session_observations: 10,
					matched_slow_sessions: 9,
					matched_strata: 1,
				},
				"LCP"
			)
		).toBeNull();
		expect(
			parseVitalCohortBehavior(
				{
					...row,
					eligible_slow_sessions: 20,
					matched_coverage_percent: 75,
					matched_peer_session_observations: 20,
					matched_slow_sessions: 15,
					matched_strata: 2,
				},
				"LCP"
			)
		).toBeNull();
	});

	it("binds only the selected exact static route vital and current window", async () => {
		const calls: unknown[] = [];
		const behavior = await loadVitalCohortBehavior(
			{
				signal: vitalSignal,
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (request) => {
				calls.push(request);
				return [row];
			}
		);

		expect(behavior?.metric).toBe("LCP");
		expect(behavior?.matchedSlowSessions).toBe(34);
		expect(calls).toEqual([
			{
				from: "2026-07-24",
				path: "/explore",
				projectId: "site-1",
				to: "2026-07-30",
				vitalMetric: "LCP",
				vitalThreshold: 2500,
				timezone: "UTC",
			},
		]);
		await expect(
			loadVitalCohortBehavior(
				{
					signal: {
						...vitalSignal,
						entity: { ...vitalSignal.entity, id: "/users/example" },
						signalKey: "route:lcp:/users/example",
					},
					timezone: "UTC",
					websiteId: "site-1",
				},
				async () => {
					throw new Error("Unsupported signal must not query behavior");
				}
			)
		).resolves.toBeNull();
		await expect(
			loadVitalCohortBehavior(
				{
					signal: {
						...vitalSignal,
						metric: { ...vitalSignal.metric, current: 2000 },
					},
					timezone: "UTC",
					websiteId: "site-1",
				},
				async () => {
					throw new Error("Healthy vital must not query behavior");
				}
			)
		).resolves.toBeNull();
	});
});
