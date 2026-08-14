import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	 errorCustomerImpactEvidence,
	 errorIdentitySetupRecommendation,
	hasMaterialRouteContinuation,
	loadErrorCustomerImpact,
	matchedErrorContinuationMeasurement,
	parseErrorCustomerImpact,
	parseRouteContinuationComparison,
} from "./error-customer-impact";

const errorSignal: InvestigationSignal = {
	changePercent: 56.5,
	entity: {
		id: "Failed to load app manifest",
		label: "Manifest loading failure",
		type: "error",
	},
	metric: {
		current: 36,
		format: "number",
		label: "Manifest loading failures",
		previous: 23,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	sentiment: "negative",
	severity: "warning",
	signalKey: "error:manifest-loading",
};

const row = {
	affected_sessions: 34,
	affected_visitor_identifiers: 35,
	ambiguous_profile_sessions: 1,
	error_occurrences: 36,
	identified_profiles: 5,
	identified_profiles_with_prior_attributed_completed_payment: 2,
	identity_coverage_percent: 14.3,
	linked_visitor_identifiers: 5,
	payment_match_is_lower_bound: 1,
	qualifying_profile_payment_history_observed: 1,
	unlinked_visitor_identifiers: 30,
};

const routeContinuationRow = {
	candidate_control_sessions: 80,
	candidate_exposed_sessions: 50,
	control_continued_sessions: 24,
	control_continuation_percent: 60,
	exposed_continued_sessions: 8,
	exposed_continuation_percent: 20,
	matched_control_sessions: 40,
	matched_exposed_sessions: 40,
	unmatched_control_sessions: 40,
	unmatched_exposed_sessions: 10,
};

describe("error customer impact", () => {
	it("parses only consistent aggregate counts", () => {
		const impact = parseErrorCustomerImpact(row);

		expect(impact).toMatchObject({
			affectedVisitorIdentifiers: 35,
			identifiedProfiles: 5,
			identifiedProfilesWithPriorAttributedCompletedPayment: 2,
			paymentMatchIsLowerBound: true,
			unlinkedVisitorIdentifiers: 30,
		});
		expect(() =>
			parseErrorCustomerImpact({ ...row, linked_visitor_identifiers: 36 })
		).toThrow("Inconsistent error customer impact result");
		expect(parseErrorCustomerImpact({ ...row, error_occurrences: 0 })).toBeNull();
	});

	it("binds the exact fingerprint and current signal window", async () => {
		const calls: unknown[] = [];
		const impact = await loadErrorCustomerImpact(
			{
				signal: errorSignal,
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (request) => {
				calls.push(request);
				return request.type === "error_route_continuation_comparison"
					? [routeContinuationRow]
					: [row];
			}
		);

		expect(impact?.errorOccurrences).toBe(36);
		expect(impact?.routeContinuation?.exposedSessions).toBe(40);
		expect(calls).toEqual([
			{
				filters: [
					{
						field: "message",
						op: "eq",
						value: "Failed to load app manifest",
					},
				],
				from: "2026-07-24",
				projectId: "site-1",
				timezone: "UTC",
				to: "2026-07-30",
				type: "error_customer_impact",
			},
			{
				filters: [
					{
						field: "message",
						op: "eq",
						value: "Failed to load app manifest",
					},
				],
				from: "2026-07-24",
				projectId: "site-1",
				timezone: "UTC",
				to: "2026-07-30",
				type: "error_route_continuation_comparison",
			},
		]);
	});

	it("binds a route signal without exposing cohort identifiers", async () => {
		const requests: Record<string, unknown>[] = [];
		const impact = await loadErrorCustomerImpact(
			{
				signal: {
					...errorSignal,
					entity: { id: "/explore", label: "Route /explore", type: "page" },
					signalKey: "route:error:/explore",
				},
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (input) => {
				requests.push(input as unknown as Record<string, unknown>);
				return input.type === "error_route_continuation_comparison"
					? [routeContinuationRow]
					: [row];
			}
		);

		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.filters).toEqual([
				{ field: "path", op: "eq", value: "/explore" },
			]);
		}
		if (!impact) {
			throw new Error("Expected route impact fixture");
		}
		expect(impact.scope).toBe("route");
		expect(impact.routeContinuation).toMatchObject({
			controlContinuationPercent: 60,
			controlSessions: 40,
			exposedContinuationPercent: 20,
			exposedSessions: 40,
			percentagePointDifference: -40,
		});
		expect(errorCustomerImpactEvidence(impact)).toContain("Errors on this route");
		expect(errorCustomerImpactEvidence(impact)).toContain(
			"This is an association, not proof"
		);
		expect(errorCustomerImpactEvidence(impact)).not.toContain("This exact error");
	});

	it("parses only internally consistent, sufficiently matched continuation cohorts", () => {
		expect(parseRouteContinuationComparison(routeContinuationRow)).toMatchObject({
			controlSessions: 40,
			exposedSessions: 40,
			unmatchedControlSessions: 40,
		});
		expect(() =>
			parseRouteContinuationComparison({
				...routeContinuationRow,
				control_continuation_percent: 99,
			})
		).toThrow("Inconsistent route continuation result");
		expect(
			parseRouteContinuationComparison({
				...routeContinuationRow,
				control_continued_sessions: 19,
				control_continuation_percent: 65.5,
				exposed_continued_sessions: 5,
				exposed_continuation_percent: 17.2,
				matched_control_sessions: 29,
				matched_exposed_sessions: 29,
				unmatched_control_sessions: 51,
				unmatched_exposed_sessions: 21,
			})
		).toBeNull();
		const nonmaterial = parseRouteContinuationComparison({
				...routeContinuationRow,
				control_continued_sessions: 36,
				control_continuation_percent: 90,
				exposed_continued_sessions: 32,
				exposed_continuation_percent: 80,
			});
		expect(nonmaterial).toMatchObject({
			percentagePointDifference: -10,
		});
		if (!nonmaterial) {
			throw new Error("Expected structurally valid continuation cohort");
		}
		expect(hasMaterialRouteContinuation(nonmaterial)).toBe(false);
	});

	it("projects only aggregate continuation facts into a persisted measurement", () => {
		const comparison = parseRouteContinuationComparison(routeContinuationRow);
		if (!comparison) {
			throw new Error("Expected matched continuation fixture");
		}
		expect(matchedErrorContinuationMeasurement(comparison)).toEqual({
			type: "matched_error_continuation",
			controlContinuationPercent: 60,
			exposedContinuationPercent: 20,
			matchedSessions: 40,
		});
	});

	it("reuses a persisted continuation cohort instead of querying it again", async () => {
		const calls: string[] = [];
		const impact = await loadErrorCustomerImpact(
			{
				signal: {
					...errorSignal,
					cohortMeasurement: {
						type: "matched_error_continuation",
						controlContinuationPercent: 60,
						exposedContinuationPercent: 20,
						matchedSessions: 40,
					},
				},
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (request) => {
				calls.push(request.type);
				return [row];
			}
		);

		expect(calls).toEqual(["error_customer_impact"]);
		expect(impact?.routeContinuation).toMatchObject({
			controlContinuationPercent: 60,
			exposedContinuationPercent: 20,
			exposedSessions: 40,
			percentagePointDifference: -40,
		});
	});

	it("skips continuation analysis before the affected session cohort is usable", async () => {
		const calls: string[] = [];
		const impact = await loadErrorCustomerImpact(
			{
				signal: errorSignal,
				timezone: "UTC",
				websiteId: "site-1",
			},
			async (request) => {
				calls.push(request.type);
				return [
					{
						...row,
						affected_sessions: 9,
						affected_visitor_identifiers: 9,
						identified_profiles: 0,
						identified_profiles_with_prior_attributed_completed_payment: 0,
						identity_coverage_percent: 0,
						linked_visitor_identifiers: 0,
						unlinked_visitor_identifiers: 9,
					},
				];
			}
		);

		expect(impact?.routeContinuation).toBeNull();
		expect(calls).toEqual(["error_customer_impact"]);
	});

	it("states payment matches as a lower bound and unknowns as unknown", () => {
		const impact = parseErrorCustomerImpact(row);
		if (!impact) {
			throw new Error("Expected impact fixture");
		}
		const evidence = errorCustomerImpactEvidence(impact);

		expect(evidence).toContain(
			"At least 2 identified profiles had an attributed completed payment"
		);
		expect(evidence).toContain("before their first error");
		expect(evidence).toContain("unmatched payment status remains unknown");
		expect(evidence).not.toContain("paying customers");
		expect(evidence).not.toContain("anonymous_id");
		expect(evidence).not.toContain("profile_id");
		expect(evidence).not.toContain("session_id");
	});

	it("offers identification only for a material fully unlinked cohort", () => {
		const impact = parseErrorCustomerImpact({
			...row,
			identified_profiles: 0,
			identified_profiles_with_prior_attributed_completed_payment: 0,
			identity_coverage_percent: 0,
			linked_visitor_identifiers: 0,
			unlinked_visitor_identifiers: 35,
		});
		if (!impact) {
			throw new Error("Expected impact fixture");
		}

		expect(errorIdentitySetupRecommendation(impact)).toEqual({
			action:
				"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
			feature: "user_identification",
			kind: "databuddy_setup",
		});
		expect(
			errorIdentitySetupRecommendation({
				...impact,
				affectedVisitorIdentifiers: 9,
				unlinkedVisitorIdentifiers: 9,
			})
		).toBeNull();
	});
});
