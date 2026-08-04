import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	configuredGoalTargetFromDefinitions,
	errorCohortGoalCompletionEvidence,
	loadErrorCohortGoalCompletion,
	observedPostErrorGoalCompletion,
	observedPostErrorGoalCompletionImpact,
	parseErrorCohortGoalCompletion,
} from "./error-cohort-goal-completion";

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
	affected_completion_percent: 8.8,
	affected_completion_sessions: 3,
	comparison_completion_percent: 45,
	eligible_error_sessions: 40,
	matched_coverage_percent: 85,
	matched_error_sessions: 34,
	matched_peer_session_observations: 380,
	matched_strata: 4,
};

describe("error cohort goal completion", () => {
	it("parses a sufficiently covered configured-target comparison", () => {
		const completion = parseErrorCohortGoalCompletion(row);

		expect(completion).toEqual({
			affectedCompletionPercent: 8.8,
			affectedCompletionSessions: 3,
			comparisonCompletionPercent: 45,
			eligibleErrorSessions: 40,
			matchedCoveragePercent: 85,
			matchedErrorSessions: 34,
			matchedPeerSessionObservations: 380,
			matchedStrata: 4,
		});
		if (!completion) {
			throw new Error("Expected configured-target fixture");
		}
		const evidence = errorCohortGoalCompletionEvidence(
			completion,
			errorSignal
		);
		expect(evidence).toContain(
			"8.8% reached the configured completion within 30 minutes after this error, versus 45.0%"
		);
		expect(evidence).toContain("association, not causation");
		expect(evidence.trim().split(/\s+/).length).toBeLessThanOrEqual(32);
		for (const unsafeTerm of [
			"abandon",
			"bounce",
			"conversion blocked",
			"retention",
			"session_id",
		]) {
			expect(evidence.toLowerCase()).not.toContain(unsafeTerm);
		}
	});

	it("only creates a backend-owned impact for a material lower target-reach rate", () => {
		const completion = parseErrorCohortGoalCompletion(row);
		if (!completion) {
			throw new Error("Expected configured-target fixture");
		}
		const observed = observedPostErrorGoalCompletion(completion);
		expect(observed).toEqual(completion);
		const impact = observedPostErrorGoalCompletionImpact(completion, errorSignal);
		expect(impact).toContain(
			"8.8% reached the configured completion within 30 minutes after this error, versus 45.0%"
		);
		expect(impact).toContain("the comparison is not causal");
		expect(impact.trim().split(/\s+/).length).toBeLessThanOrEqual(32);
		for (const unsafeTerm of [
			"abandon",
			"blocked",
			"caused",
			"retention",
			"task failure",
		]) {
			expect(impact.toLowerCase()).not.toContain(unsafeTerm);
		}
		expect(
			observedPostErrorGoalCompletion({
				...completion,
				comparisonCompletionPercent: 20,
			})
		).toBeNull();
	});

	it("rejects inconsistent aggregate coverage and rates", () => {
		expect(() =>
			parseErrorCohortGoalCompletion({
				...row,
				matched_coverage_percent: 84.9,
			})
		).toThrow("Inconsistent error cohort goal completion coverage");
		expect(() =>
			parseErrorCohortGoalCompletion({
				...row,
				affected_completion_percent: 8.7,
			})
		).toThrow("Inconsistent error cohort goal completion percentage");
	});

	it("withholds sparse and weakly covered comparisons", () => {
		expect(
			parseErrorCohortGoalCompletion({
				...row,
				affected_completion_percent: 11.1,
				affected_completion_sessions: 1,
				eligible_error_sessions: 10,
				matched_coverage_percent: 90,
				matched_error_sessions: 9,
				matched_peer_session_observations: 10,
				matched_strata: 1,
			})
		).toBeNull();
		expect(
			parseErrorCohortGoalCompletion({
				...row,
				affected_completion_percent: 6.7,
				affected_completion_sessions: 1,
				eligible_error_sessions: 20,
				matched_coverage_percent: 75,
				matched_error_sessions: 15,
				matched_peer_session_observations: 20,
				matched_strata: 2,
			})
		).toBeNull();
	});

	it("binds one configured goal and never queries when configuration is unavailable", async () => {
		const calls: unknown[] = [];
		const completion = await loadErrorCohortGoalCompletion(
			{ signal: errorSignal, timezone: "UTC", websiteId: "site-1" },
			{
				fetchConfiguredGoal: async () => ({
					target: "/completed",
					type: "PAGE_VIEW",
				}),
				query: async (request) => {
					calls.push(request);
					return [row];
				},
			}
		);

		expect(completion?.matchedErrorSessions).toBe(34);
		expect(calls).toEqual([
			{
				errorSelector: {
					field: "message",
					value: "Manifest request failed",
				},
				from: "2026-07-24",
				goalTarget: "/completed",
				goalType: "PAGE_VIEW",
				projectId: "site-1",
				to: "2026-07-30",
				timezone: "UTC",
			},
		]);
		await expect(
			loadErrorCohortGoalCompletion(
				{ signal: errorSignal, timezone: "UTC", websiteId: "site-1" },
				{
					fetchConfiguredGoal: async () => null,
					query: async () => {
						throw new Error("Unavailable configuration must not query");
					},
				}
			)
		).resolves.toBeNull();

		const routeSignal: InvestigationSignal = {
			...errorSignal,
			entity: { id: "/browse/", label: "/browse", type: "page" },
			signalKey: "route:error:/browse",
		};
		await loadErrorCohortGoalCompletion(
			{ signal: routeSignal, timezone: "UTC", websiteId: "site-1" },
			{
				fetchConfiguredGoal: async () => ({
					target: "completed_event",
					type: "EVENT",
				}),
				query: async (request) => {
					calls.push(request);
					return [row];
				},
			}
		);
		expect(calls.at(-1)).toMatchObject({
			errorSelector: { field: "path", value: "/browse" },
			goalTarget: "completed_event",
			goalType: "EVENT",
		});
	});

	it("accepts one stable goal and suppresses ambiguous or changed configuration", () => {
		const definition = {
			createdAt: new Date("2026-07-01T00:00:00.000Z"),
			filters: null,
			target: "/completed/",
			type: "PAGE_VIEW" as const,
			updatedAt: new Date("2026-07-01T00:00:00.000Z"),
		};
		expect(
			configuredGoalTargetFromDefinitions([definition], {
				signal: errorSignal,
				timezone: "UTC",
			})
		).toEqual({ target: "/completed", type: "PAGE_VIEW" });
		expect(
			configuredGoalTargetFromDefinitions(
				[definition, { ...definition, target: "/other" }],
				{ signal: errorSignal, timezone: "UTC" }
			)
		).toBeNull();
		expect(
			configuredGoalTargetFromDefinitions(
				[
					{
						...definition,
						updatedAt: new Date("2026-07-25T00:00:00.000Z"),
					},
				],
				{ signal: errorSignal, timezone: "UTC" }
			)
		).toBeNull();
		expect(
			configuredGoalTargetFromDefinitions(
				[
					{
						...definition,
						filters: [
							{
								field: "country",
								operator: "equals",
								value: "US",
							},
						],
					},
				],
				{ signal: errorSignal, timezone: "UTC" }
			)
		).toBeNull();
	});
});
