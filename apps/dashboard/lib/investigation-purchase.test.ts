import { describe, expect, test } from "bun:test";
import { getInvestigationBillingFeatureId, INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import {
	credits_booster, credits_topup, free, hobby, intelligence, intelligence_scale,
	investigations_topup, investigation_runs, pro, pulse_hobby, pulse_pro, scale,
} from "../autumn.config";
import { quoteInvestigationPurchase } from "./investigation-purchase";
import { calculateTopupCost, TOPUP_FEATURE_ID, TOPUP_TIERS } from "./topup-math";

describe("fixed investigation purchases", () => {
	test.each([1, 10, 137, 1000])("quotes %i units at exactly one dollar without credit tiers", (quantity) => {
		expect(quoteInvestigationPurchase(quantity)).toEqual({
			costUsd: quantity, planId: "investigations_topup",
			featureQuantities: [{ featureId: "investigation_runs", quantity }],
		});
	});

	test.each([0, -1, 0.5, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid quantity %s", (quantity) => {
		expect(() => quoteInvestigationPurchase(quantity)).toThrow();
	});

	test("new catalog item is prepaid without a reset, expiration, or volume discount", () => {
		expect(investigation_runs).toMatchObject({ id: INVESTIGATION_USAGE.featureId, type: "metered", consumable: true });
		expect(investigations_topup).toMatchObject({ addOn: true, autoEnable: false });
		expect(investigations_topup.items).toEqual([{
			featureId: "investigation_runs",
			price: { amount: 1, interval: "one_off", billingMethod: "prepaid", billingUnits: 1, maxPurchase: 1000 },
		}]);
	});

	test("active plan versions opt in with zero units and preserve every old credit grant", () => {
		for (const [plan, monthly, daily] of [
			[free, 10, undefined], [hobby, 20, 1], [pro, 350, 5],
			[intelligence, 1500, undefined], [intelligence_scale, 5000, undefined],
		] as const) {
			expect(plan.items?.filter((item) => item.featureId === "investigation_runs")).toEqual([{ featureId: "investigation_runs", included: 0 }]);
			const credits = plan.items?.filter((item) => item.featureId === "agent_credits");
			expect(credits?.find((item) => item.reset?.interval === "month")?.included).toBe(monthly);
			expect(credits?.find((item) => item.reset?.interval === "day")?.included).toBe(daily);
		}
	});

	test("legacy plans and credit top-ups are not converted into investigation units", () => {
		for (const plan of [scale, pulse_hobby, pulse_pro, credits_booster, credits_topup]) {
			expect(plan.items?.some((item) => item.featureId === "investigation_runs")).toBe(false);
		}
		expect(TOPUP_FEATURE_ID).toBe("agent_credits");
		expect(credits_topup.items?.[0]?.price?.tiers).toEqual(TOPUP_TIERS);
		expect(calculateTopupCost(100)).toBe(12);
		expect(credits_booster.items?.[0]).toMatchObject({ included: 200, rollover: { max: 400, expiryDurationType: "forever" } });
	});
});

describe("investigation billing mode", () => {
	test("zero fixed balance remains fixed instead of falling back to available legacy credits", () => {
		expect(getInvestigationBillingFeatureId({ investigation_runs: { remaining: 0 }, agent_credits: { remaining: 500 } })).toBe("investigation_runs");
		expect(getInvestigationBillingFeatureId({ investigation_runs: { remaining: 10 } })).toBe("investigation_runs");
	});

	test("absence retains legacy terms, while inherited properties do not grant an entitlement", () => {
		for (const balances of [undefined, null, {}, { agent_credits: { remaining: 100 } }, Object.create({ investigation_runs: { remaining: 5 } })]) {
			expect(getInvestigationBillingFeatureId(balances)).toBe("agent_credits");
		}
	});
});
