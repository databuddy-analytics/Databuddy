import { describe, expect, it } from "bun:test";
import {
	GATED_FEATURES,
	getNextPlanForFeature,
	getPlanCapabilities,
	getPlanFeatureLimit,
	INTELLIGENCE_PLAN_IDS,
	PLAN_IDS,
} from "./features";

describe("plan feature helpers", () => {
	it("returns capabilities for known plans", () => {
		expect(getPlanFeatureLimit(PLAN_IDS.PRO, GATED_FEATURES.FEATURE_FLAGS)).toBe(
			100
		);
		expect(getNextPlanForFeature(PLAN_IDS.PRO, GATED_FEATURES.FUNNELS)).toBe(
			PLAN_IDS.SCALE
		);
		expect(getPlanCapabilities(PLAN_IDS.HOBBY).features.error_tracking).toBe(
			true
		);
	});

	it("gives invitation-only intelligence plans Scale capabilities", () => {
		expect(getPlanCapabilities(INTELLIGENCE_PLAN_IDS.ANALYST)).toEqual(
			getPlanCapabilities(PLAN_IDS.SCALE)
		);
		expect(getPlanCapabilities(INTELLIGENCE_PLAN_IDS.DATA_TEAM)).toEqual(
			getPlanCapabilities(PLAN_IDS.SCALE)
		);
	});

	it("treats unknown plan ids as free instead of throwing", () => {
		expect(getPlanFeatureLimit("legacy-enterprise", GATED_FEATURES.FUNNELS)).toBe(
			1
		);
		expect(
			getNextPlanForFeature("legacy-enterprise", GATED_FEATURES.ERROR_TRACKING)
		).toBe(PLAN_IDS.HOBBY);
		expect(getPlanCapabilities("legacy-enterprise")).toBe(
			getPlanCapabilities(PLAN_IDS.FREE)
		);
	});
});
