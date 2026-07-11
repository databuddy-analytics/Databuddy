import { describe, expect, it } from "bun:test";
import {
	INSIGHT_COOLDOWN_HOURS,
	INSIGHT_LOOKBACK_DAYS,
	INSIGHT_MAX_STEPS,
	insightDepth,
	MAX_INSIGHTS_PER_WEBSITE,
} from "./policy";

describe("insight policy", () => {
	it("keeps execution limits internal and fixed", () => {
		expect({
			cooldownHours: INSIGHT_COOLDOWN_HOURS,
			lookbackDays: INSIGHT_LOOKBACK_DAYS,
			maxInsights: MAX_INSIGHTS_PER_WEBSITE,
			maxSteps: INSIGHT_MAX_STEPS,
		}).toEqual({
			cooldownHours: 6,
			lookbackDays: 7,
			maxInsights: 3,
			maxSteps: 8,
		});
	});

	it("derives investigation depth from quality", () => {
		expect([
			insightDepth("fast"),
			insightDepth("balanced"),
			insightDepth("deep"),
		]).toEqual(["surface", "investigated", "deep"]);
	});
});
