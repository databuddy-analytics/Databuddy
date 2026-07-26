import { describe, expect, test } from "bun:test";
import { LEGACY_SCALE_PLAN } from "@databuddy/shared/billing";
import { INTELLIGENCE_PLAN_IDS } from "@databuddy/shared/types/features";
import { getCustomerPlanName } from "./customer-plan-name";

describe("getCustomerPlanName", () => {
	test("presents the internal scale plan as Enterprise", () => {
		expect(getCustomerPlanName(LEGACY_SCALE_PLAN.id, "Scale")).toBe(
			LEGACY_SCALE_PLAN.name
		);
	});

	test("keeps other plan names unchanged", () => {
		expect(getCustomerPlanName("pro", "Pro")).toBe("Pro");
	});

	test("presents invitation-only intelligence plan names", () => {
		expect(
			getCustomerPlanName(INTELLIGENCE_PLAN_IDS.ANALYST, "Intelligence")
		).toBe("Analyst");
		expect(
			getCustomerPlanName(
				INTELLIGENCE_PLAN_IDS.DATA_TEAM,
				"Intelligence_scale"
			)
		).toBe("Data Team");
	});
});
