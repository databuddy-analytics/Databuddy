import { describe, expect, test } from "bun:test";
import { LEGACY_SCALE_PLAN } from "@databuddy/shared/billing";
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
});
