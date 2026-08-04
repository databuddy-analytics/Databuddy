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

function compileCohortBehavior(field: "message" | "path", value: string) {
	const config = QueryBuilders.error_cohort_behavior;
	if (!config) {
		throw new Error("error_cohort_behavior builder is missing");
	}
	return new SimpleQueryBuilder(config, {
		filters: [{ field, op: "eq", value }],
		from: "2026-07-24",
		projectId: "site-1",
		to: "2026-07-30",
		type: "error_cohort_behavior",
	}).compile();
}

function compileOverlap() {
	const config = QueryBuilders.error_candidate_overlap;
	if (!config) {
		throw new Error("error_candidate_overlap builder is missing");
	}
	return new SimpleQueryBuilder(config, {
		filters: [
			{
				field: "message",
				op: "eq",
				value: "Failed to fetch dynamically imported module",
			},
			{ field: "path", op: "eq", value: "/explore" },
		],
		from: "2026-07-24",
		projectId: "site-1",
		to: "2026-07-30",
		type: "error_candidate_overlap",
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
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "message", op: "eq", value: "manifest" },
					{ field: "country", op: "eq", value: "US" },
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
		expect(sql).toContain(
			"profile_id IN (SELECT resolved_profile_id FROM affected_profiles)"
		);
		expect(sql).toContain(
			"payment.first_completed_payment_at <= affected.first_error_at"
		);
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
			"sessions_with_later_telemetry",
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

describe("error cohort behavior query", () => {
	it("requires one exact fingerprint or canonical route", () => {
		const config = QueryBuilders.error_cohort_behavior;
		if (!config) {
			throw new Error("error_cohort_behavior builder is missing");
		}
		const request = {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "error_cohort_behavior",
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
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "message", op: "eq", value: "manifest" },
					{ field: "country", op: "eq", value: "US" },
				],
			}).compile()
		).toThrow("requires exactly one scalar message or path equality filter");
	});

	it("returns only route/day-matched aggregate continuation metrics", () => {
		const { params, sql } = compileCohortBehavior(
			"message",
			"Failed to fetch dynamically imported module"
		);
		const config = QueryBuilders.error_cohort_behavior;
		const outputFields = config?.meta?.output_fields?.map((field) => field.name);

		expect(sql).toContain("exposed_anchors AS");
		expect(sql).toContain("trackable_exposed_anchors AS");
		expect(sql).toContain("control_anchors AS");
		expect(sql).toContain("matched_strata AS");
		expect(sql).toContain("toTimeZone");
		expect(sql).toContain("INTERVAL 30 MINUTE");
		expect(sql).toContain("peer_session_observations >= 10");
		expect(sql).toContain("event.time <= exposed.anchor_at");
		expect(sql).toContain("!= exposed.error_path");
		expect(sql).toContain("!= control.error_path");
		expect(params.f0).toBe("Failed to fetch dynamically imported module");
		expect(params.timezone).toBe("UTC");
		expect(config?.customizable).toBe(false);
		expect(config?.noCache).toBe(true);
		expect(config?.publicAccess).not.toBe(true);
		expect(outputFields).toEqual([
			"eligible_error_sessions",
			"matched_error_sessions",
			"matched_peer_session_observations",
			"matched_strata",
			"matched_coverage_percent",
			"affected_next_page_percent",
			"comparison_next_page_percent",
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

	it("normalizes exact route selectors before matching controls", () => {
		const { params, sql } = compileCohortBehavior("path", "/explore");

		expect(sql).toContain("trimRight(path(es.path), '/')");
		expect(sql).toContain("trimRight(path(event.path), '/')");
		expect(params.f0).toBe("/explore");
	});
});

describe("error candidate overlap query", () => {
	it("requires one exact fingerprint and one canonical route", () => {
		const config = QueryBuilders.error_candidate_overlap;
		if (!config) {
			throw new Error("error_candidate_overlap builder is missing");
		}
		const request = {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "error_candidate_overlap",
		};

		expect(() => new SimpleQueryBuilder(config, request).compile()).toThrow(
			"Missing required filters: 'message', 'path'."
		);
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [{ field: "message", op: "eq", value: "manifest" }],
			}).compile()
		).toThrow("Missing required filter: 'path'.");
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "message", op: "eq", value: "manifest" },
					{ field: "path", op: "eq", value: "/explore" },
					{ field: "error_type", op: "eq", value: "TypeError" },
				],
			}).compile()
		).toThrow(
			"error_candidate_overlap requires one scalar message equality filter and one scalar path equality filter"
		);
	});

	it("returns only aggregate overlap cardinalities", () => {
		const { params, sql } = compileOverlap();
		const config = QueryBuilders.error_candidate_overlap;
		const outputFields = config?.meta?.output_fields?.map((field) => field.name);

		expect(sql).toContain("fingerprint_errors AS");
		expect(sql).toContain("route_errors AS");
		expect(sql).toContain("cooccurring_errors AS");
		expect(sql).toContain("shared_visitor_identifiers");
		expect(sql).toContain("visitor_overlap_measurable");
		expect(sql).toContain("trimRight(path(path), '/')");
		expect(params.f0).toBe("Failed to fetch dynamically imported module");
		expect(params.f1).toBe("/explore");
		expect(config?.publicAccess).not.toBe(true);
		expect(outputFields).toEqual([
			"fingerprint_error_occurrences",
			"route_error_occurrences",
			"cooccurring_error_occurrences",
			"fingerprint_sessions",
			"route_sessions",
			"shared_sessions",
			"cooccurring_sessions",
			"fingerprint_visitor_identifiers",
			"route_visitor_identifiers",
			"shared_visitor_identifiers",
			"cooccurring_visitor_identifiers",
			"session_overlap_measurable",
			"visitor_overlap_measurable",
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
});
