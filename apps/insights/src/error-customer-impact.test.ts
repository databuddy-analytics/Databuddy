import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	errorCustomerImpactEvidence,
	errorIdentitySetupRecommendation,
	loadErrorCustomerImpact,
	parseErrorCustomerImpact,
	priorCompletedPaymentSummary,
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
	sessions_with_later_telemetry: 20,
	unlinked_visitor_identifiers: 30,
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
				return [row];
			}
		);

		expect(impact?.errorOccurrences).toBe(36);
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
		]);
	});

	it("binds a route signal without exposing cohort identifiers", async () => {
		let request: Record<string, unknown> | undefined;
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
				request = input as unknown as Record<string, unknown>;
				return [row];
			}
		);

		expect(request?.filters).toEqual([
			{ field: "path", op: "eq", value: "/explore" },
		]);
		if (!impact) {
			throw new Error("Expected route impact fixture");
		}
		expect(impact.scope).toBe("route");
		expect(errorCustomerImpactEvidence(impact)).not.toContain("/explore");
	});

	it("states one concise identity or payment fact without inventing status", () => {
		const noIdentity = parseErrorCustomerImpact({
			...row,
			identified_profiles: 0,
			identified_profiles_with_prior_attributed_completed_payment: 0,
			identity_coverage_percent: 0,
			linked_visitor_identifiers: 0,
			qualifying_profile_payment_history_observed: 0,
			unlinked_visitor_identifiers: 35,
		});
		const partialIdentity = parseErrorCustomerImpact({
			...row,
			identified_profiles_with_prior_attributed_completed_payment: 0,
			qualifying_profile_payment_history_observed: 0,
		});
		const paymentLowerBound = parseErrorCustomerImpact(row);
		for (const [impact, expected] of [
			[
				noIdentity,
				"No affected identifiers linked to profiles, so customer and payment status are unknown.",
			],
			[
				partialIdentity,
				"5 of 35 affected identifiers linked to profiles; payment status remains unknown.",
			],
			[
				paymentLowerBound,
				"At least 2 affected profiles had an attributed completed payment before the error; other payment status is unknown.",
			],
		] as const) {
			if (!impact) {
				throw new Error("Expected impact fixture");
			}
			const evidence = errorCustomerImpactEvidence(impact);
			expect(evidence).toBe(expected);
			expect(evidence.trim().split(/\s+/).length).toBeLessThanOrEqual(25);
			expect(evidence).not.toContain("active subscription");
			expect(evidence).not.toContain("paying customers");
			expect(evidence).not.toContain("anonymous_id");
			expect(evidence).not.toContain("profile_id");
			expect(evidence).not.toContain("session_id");
		}
	});

	it("exposes only a qualified prior-payment lower bound in a brief", () => {
		const paymentLowerBound = parseErrorCustomerImpact(row);
		if (!paymentLowerBound) {
			throw new Error("Expected payment lower bound fixture");
		}

		expect(priorCompletedPaymentSummary(paymentLowerBound)).toBe(
			"At least 2 affected profiles had a prior attributed completed payment."
		);
		expect(
			priorCompletedPaymentSummary({
				...paymentLowerBound,
				identifiedProfilesWithPriorAttributedCompletedPayment: 0,
			})
		).toBeNull();
		expect(
			priorCompletedPaymentSummary({
				...paymentLowerBound,
				qualifyingProfilePaymentHistoryObserved: false,
			})
		).toBeNull();
		expect(
			priorCompletedPaymentSummary({
				...paymentLowerBound,
				identifiedProfilesWithPriorAttributedCompletedPayment: 6,
			})
		).toBeNull();
		expect(
			errorCustomerImpactEvidence({
				...paymentLowerBound,
				qualifyingProfilePaymentHistoryObserved: false,
			})
		).toBe(
			"5 of 35 affected identifiers linked to profiles; payment status remains unknown."
		);
		const summary = priorCompletedPaymentSummary(paymentLowerBound);
		expect(summary).not.toContain("active subscription");
		expect(summary).not.toContain("paying customer");
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
