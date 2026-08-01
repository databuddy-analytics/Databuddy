import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	errorCustomerImpactEvidence,
	loadErrorCustomerImpact,
	parseErrorCustomerImpact,
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
	sessions_with_later_tracked_activity: 20,
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
		expect(errorCustomerImpactEvidence(impact)).toContain("Errors on this route");
		expect(errorCustomerImpactEvidence(impact)).not.toContain("This exact error");
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
});
