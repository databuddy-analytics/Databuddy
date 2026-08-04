import { describe, expect, it } from "vitest";
import {
	executeInsightsVitalCohortBehaviorQuery,
	executeQuery,
} from ".";

describe("Insights vital cohort behavior executor", () => {
	it("rejects a non-canonical route before querying the warehouse", () => {
		expect(() =>
			executeInsightsVitalCohortBehaviorQuery({
				from: "2026-07-24",
				path: "checkout",
				projectId: "site-1",
				to: "2026-07-30",
				vitalMetric: "LCP",
				vitalThreshold: 2500,
			})
		).toThrow("path must be a canonical route");
	});

	it("rejects a non-positive threshold before querying the warehouse", () => {
		expect(() =>
			executeInsightsVitalCohortBehaviorQuery({
				from: "2026-07-24",
				path: "/checkout",
				projectId: "site-1",
				to: "2026-07-30",
				vitalMetric: "INP",
				vitalThreshold: 0,
			})
		).toThrow();
	});

	it("does not make the private cohort query available through the public executor", async () => {
		await expect(
			executeQuery({
				filters: [
					{ field: "path", op: "eq", value: "/checkout" },
					{ field: "vital_metric", op: "eq", value: "LCP" },
					{ field: "vital_threshold", op: "eq", value: 2500 },
				],
				from: "2026-07-24",
				projectId: "site-1",
				to: "2026-07-30",
				type: "insights_vital_cohort_behavior",
			})
		).rejects.toThrow("Unknown query type: insights_vital_cohort_behavior");
	});
});
