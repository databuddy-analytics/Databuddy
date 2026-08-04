import { describe, expect, it } from "vitest";
import { QueryBuilders } from ".";
import { SimpleQueryBuilder } from "../simple-builder";
import { SetupBuilders } from "./setup";

describe("Insights setup coverage query", () => {
	it("returns only aggregate coverage for one website", () => {
		const config = SetupBuilders.insights_setup_coverage;
		if (!config) {
			throw new Error("insights_setup_coverage builder is missing");
		}
		const { params, sql } = new SimpleQueryBuilder(config, {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_setup_coverage",
		}).compile();

		expect(sql).toContain("session_identity AS");
		expect(sql).toContain("custom_event_coverage AS");
		expect(sql).toContain("client_id = {websiteId:String}");
		expect(sql).toContain(
			"(owner_id = {websiteId:String} OR website_id = {websiteId:String})"
		);
		expect(sql).toContain("uniqExactIf");
		expect(params.websiteId).toBe("site-1");
		expect(config.customizable).toBe(false);
		expect(config.publicAccess).not.toBe(true);
		expect(config.meta?.output_fields?.map((field) => field.name)).toEqual([
			"pageviews",
			"tracked_sessions",
			"identified_sessions",
			"identified_profiles",
			"custom_event_types",
			"sessions_with_custom_events",
		]);
		for (const unsafe of [
			"anonymous_id",
			"event_name",
			"profile_id",
			"properties",
			"session_id",
		]) {
			expect(config.meta?.output_fields?.map((field) => field.name)).not.toContain(
				unsafe
			);
		}
		expect("insights_setup_coverage" in QueryBuilders).toBe(false);
	});
});

describe("Insights vital cohort behavior query", () => {
	it("keeps route-vital cohorts private and returns only aggregate continuation rates", () => {
		const config = SetupBuilders.insights_vital_cohort_behavior;
		if (!config) {
			throw new Error("insights_vital_cohort_behavior builder is missing");
		}
		const { params, sql } = new SimpleQueryBuilder(config, {
			filters: [
				{ field: "path", op: "eq", value: "/checkout" },
				{ field: "vital_metric", op: "eq", value: "LCP" },
				{ field: "vital_threshold", op: "eq", value: 2500 },
			],
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_vital_cohort_behavior",
		}).compile();

		expect(sql).toContain("route_vital_samples AS");
		expect(sql).toContain("slow_metric_session_days AS");
		expect(sql).toContain("trackable_slow_anchors AS");
		expect(sql).toContain("trackable_healthy_anchors AS");
		expect(sql).toContain("INTERVAL 5 MINUTE");
		expect(sql).toContain("INTERVAL 30 MINUTE");
		expect(sql).toContain("vital.metric_name = {vitalMetric:String}");
		expect(sql).toContain("vital.metric_value >= {vitalThreshold:Float64}");
		expect(sql).toContain("healthy.session_id, healthy.local_day) NOT IN");
		expect(sql).toContain("peer_session_observations >= 10");
		expect(params.routePath).toBe("/checkout");
		expect(params.vitalMetric).toBe("LCP");
		expect(params.vitalThreshold).toBe(2500);
		expect(config.customizable).toBe(false);
		expect(config.publicAccess).not.toBe(true);
		expect(config.meta?.output_fields?.map((field) => field.name)).toEqual([
			"eligible_slow_sessions",
			"matched_slow_sessions",
			"matched_peer_session_observations",
			"matched_strata",
			"matched_coverage_percent",
			"slow_next_page_percent",
			"comparison_next_page_percent",
		]);
		for (const unsafe of [
			"anonymous_id",
			"event_name",
			"metric_name",
			"path",
			"session_id",
		]) {
			expect(config.meta?.output_fields?.map((field) => field.name)).not.toContain(
				unsafe
			);
		}
		expect("insights_vital_cohort_behavior" in QueryBuilders).toBe(false);
	});

	it("rejects incomplete, non-canonical, or unsafe route-vital selectors", () => {
		const config = SetupBuilders.insights_vital_cohort_behavior;
		if (!config) {
			throw new Error("insights_vital_cohort_behavior builder is missing");
		}
		const request = {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_vital_cohort_behavior",
		};
		expect(() => new SimpleQueryBuilder(config, request).compile()).toThrow(
			"Missing required filters: 'path', 'vital_metric', 'vital_threshold'"
		);
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "path", op: "eq", value: "/checkout/" },
					{ field: "vital_metric", op: "eq", value: "CLS" },
					{ field: "vital_threshold", op: "eq", value: 0 },
				],
			}).compile()
		).toThrow("requires exactly one canonical path, LCP or INP metric");
	});
});

describe("Insights error cohort goal completion query", () => {
	it("keeps the configured target and every cohort member private", () => {
		const config = SetupBuilders.insights_error_cohort_goal_completion;
		if (!config) {
			throw new Error("insights_error_cohort_goal_completion builder is missing");
		}
		const { params, sql } = new SimpleQueryBuilder(config, {
			filters: [
				{
					field: "message",
					op: "eq",
					value: "Exact error fingerprint",
				},
				{ field: "goal_target", op: "eq", value: "/completed" },
				{ field: "goal_type", op: "eq", value: "PAGE_VIEW" },
			],
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_error_cohort_goal_completion",
		}).compile();

		expect(sql).toContain("trackable_exposed_anchors AS");
		expect(sql).toContain("control_anchors AS");
		expect(sql).toContain("target_events AS");
		expect(sql).toContain("INTERVAL 30 MINUTE");
		expect(sql).toContain("peer_session_observations >= 10");
		expect(sql).toContain("event.session_id NOT IN (SELECT session_id FROM matched_errors)");
		expect(params.errorSelector).toBe("Exact error fingerprint");
		expect(params.goalTarget).toBe("/completed");
		expect(config.customizable).toBe(false);
		expect(config.publicAccess).not.toBe(true);
		expect(config.meta?.output_fields?.map((field) => field.name)).toEqual([
			"eligible_error_sessions",
			"matched_error_sessions",
			"matched_peer_session_observations",
			"matched_strata",
			"matched_coverage_percent",
			"affected_completion_sessions",
			"affected_completion_percent",
			"comparison_completion_percent",
		]);
		for (const unsafe of [
			"anonymous_id",
			"event_name",
			"goal_target",
			"profile_id",
			"session_id",
		]) {
			expect(config.meta?.output_fields?.map((field) => field.name)).not.toContain(
				unsafe
			);
		}
		expect("insights_error_cohort_goal_completion" in QueryBuilders).toBe(
			false
		);
	});

	it("rejects incomplete or non-scalar goal completion inputs", () => {
		const config = SetupBuilders.insights_error_cohort_goal_completion;
		if (!config) {
			throw new Error("insights_error_cohort_goal_completion builder is missing");
		}
		const request = {
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_error_cohort_goal_completion",
		};
		expect(() => new SimpleQueryBuilder(config, request).compile()).toThrow(
			"Missing required filters: 'goal_target', 'goal_type'"
		);
		expect(() =>
			new SimpleQueryBuilder(config, {
				...request,
				filters: [
					{ field: "message", op: "eq", value: "error" },
					{ field: "goal_target", op: "eq", value: ["/completed"] },
					{ field: "goal_type", op: "eq", value: "PAGE_VIEW" },
				],
			}).compile()
		).toThrow("requires one scalar message or path selector");
	});

	it("uses the session-attributable custom-event stream for event goals", () => {
		const config = SetupBuilders.insights_error_cohort_goal_completion;
		if (!config) {
			throw new Error("insights_error_cohort_goal_completion builder is missing");
		}
		const { sql } = new SimpleQueryBuilder(config, {
			filters: [
				{ field: "message", op: "eq", value: "error" },
				{ field: "goal_target", op: "eq", value: "completed_event" },
				{ field: "goal_type", op: "eq", value: "EVENT" },
			],
			from: "2026-07-24",
			projectId: "site-1",
			to: "2026-07-30",
			type: "insights_error_cohort_goal_completion",
		}).compile();

		expect(sql).toContain("FROM analytics.custom_events goal_event");
		expect(sql).toContain("goal_event.session_id != ''");
		expect(sql).toContain("goal_event.event_name = {goalTarget:String}");
	});
});
