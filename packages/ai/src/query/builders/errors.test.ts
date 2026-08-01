import { describe, expect, it } from "vitest";
import { SimpleQueryBuilder } from "../simple-builder";
import { QueryBuilders } from "./index";

function compileImpact(field: "message" | "path", value: string) {
	const config = QueryBuilders.error_customer_impact;
	if (!config) {
		throw new Error("error_customer_impact builder is missing");
	}
	return new SimpleQueryBuilder(config, {
		filters: [{ field, op: "eq", value }],
		from: "2026-07-24",
		projectId: "site-1",
		to: "2026-07-30",
		type: "error_customer_impact",
	}).compile();
}

describe("error customer impact query", () => {
	it("requires one exact fingerprint or canonical route", () => {
		const config = QueryBuilders.error_customer_impact;
		if (!config) {
			throw new Error("error_customer_impact builder is missing");
		}
		const request = {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "error_customer_impact",
		};

		expect(() => new SimpleQueryBuilder(config, request).compile()).toThrow(
			"Missing required filter: one of 'message', 'path'"
		);
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [{ field: "message", op: "contains", value: "manifest" }],
			}).compile()
		).toThrow("Operator 'contains' is not permitted for filter 'message'");
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "message", op: "eq", value: "manifest" },
					{ field: "path", op: "eq", value: "/explore" },
				],
			}).compile()
		).toThrow("requires exactly one scalar message or path equality filter");
	});

	it("preaggregates identity and terminal payment facts without returning ids", () => {
		const { params, sql } = compileImpact(
			"message",
			"Failed to fetch dynamically imported module"
		);
		const config = QueryBuilders.error_customer_impact;
		const outputFields = config?.meta?.output_fields?.map((field) => field.name);

		expect(sql).toContain("matched_errors AS");
		expect(sql).toContain("identity_rows AS");
		expect(sql).toContain("GROUP BY owner_id, provider, transaction_id");
		expect(sql).toContain("status = 'completed'");
		expect(sql).toContain("type IN ('sale', 'subscription')");
		expect(sql).toContain("uniqExactIf");
		expect(params.f0).toBe("Failed to fetch dynamically imported module");
		expect(config?.publicAccess).not.toBe(true);
		expect(outputFields).toEqual([
			"error_occurrences",
			"affected_sessions",
			"affected_visitor_identifiers",
			"linked_visitor_identifiers",
			"identified_profiles",
			"unlinked_visitor_identifiers",
			"ambiguous_profile_sessions",
			"identity_coverage_percent",
			"sessions_with_later_tracked_activity",
			"identified_profiles_with_prior_attributed_completed_payment",
			"qualifying_profile_payment_history_observed",
			"payment_match_is_lower_bound",
		]);
		for (const unsafe of [
			"anonymous_id",
			"profile_id",
			"session_id",
			"transaction_id",
			"customer_id",
			"email",
		]) {
			expect(outputFields).not.toContain(unsafe);
		}
	});

	it("normalizes exact route selectors before narrowing the cohort", () => {
		const { params, sql } = compileImpact("path", "/explore");

		expect(sql).toContain("trimRight(path(path), '/')");
		expect(params.f0).toBe("/explore");
	});
});
