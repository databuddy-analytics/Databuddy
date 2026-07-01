import {
	INSIGHTS_DISPATCH_JOB_NAME,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_MAINTENANCE_JOB_NAME,
	INSIGHTS_ROLLUP_JOB_NAME,
} from "@databuddy/redis";
import { describe, expect, it } from "bun:test";
import {
	buildInsightsStalledJobEvent,
	inferInsightsStalledJobName,
	UNKNOWN_INSIGHTS_JOB_NAME,
} from "./worker-events";

describe("inferInsightsStalledJobName", () => {
	it("infers website generation jobs from stable job ids", () => {
		expect(inferInsightsStalledJobName("insights-website-run_1-web_1")).toBe(
			INSIGHTS_GENERATE_WEBSITE_JOB_NAME
		);
	});

	it("infers rollup jobs from stable job ids", () => {
		expect(inferInsightsStalledJobName("insights-rollup-run_1")).toBe(
			INSIGHTS_ROLLUP_JOB_NAME
		);
	});

	it("infers dispatch scheduler jobs from repeat ids", () => {
		expect(
			inferInsightsStalledJobName("repeat:insights-dispatch:1234567890")
		).toBe(INSIGHTS_DISPATCH_JOB_NAME);
	});

	it("infers maintenance scheduler jobs from repeat ids", () => {
		expect(
			inferInsightsStalledJobName("repeat:insights-maintenance:1234567890")
		).toBe(INSIGHTS_MAINTENANCE_JOB_NAME);
	});

	it("falls back to unknown for unrecognized stalled job ids", () => {
		expect(inferInsightsStalledJobName("custom-job-id")).toBe(
			UNKNOWN_INSIGHTS_JOB_NAME
		);
	});
});

describe("buildInsightsStalledJobEvent", () => {
	it("builds the warning event context without Redis lookups", () => {
		expect(buildInsightsStalledJobEvent("insights-rollup-run_1")).toEqual({
			job_id: "insights-rollup-run_1",
			job_name: INSIGHTS_ROLLUP_JOB_NAME,
		});
	});
});
