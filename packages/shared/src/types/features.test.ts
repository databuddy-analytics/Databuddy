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
