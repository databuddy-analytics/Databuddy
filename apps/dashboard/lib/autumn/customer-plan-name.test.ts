import { describe, expect, test } from "bun:test";
import { getCustomerPlanName } from "./customer-plan-name";

describe("getCustomerPlanName", () => {
	test("presents the internal scale plan as Enterprise", () => {
		expect(getCustomerPlanName("scale", "Scale")).toBe("Enterprise");
	});

	test("keeps other plan names unchanged", () => {
		expect(getCustomerPlanName("pro", "Pro")).toBe("Pro");
	});
});
