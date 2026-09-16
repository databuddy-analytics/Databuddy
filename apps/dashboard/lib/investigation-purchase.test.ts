import { describe, expect, test } from "bun:test";
import {
	getInvestigationBillingFeatureId,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import {
	credits_booster, credits_topup, free, hobby, intelligence, intelligence_scale,
	investigations_topup, investigation_runs, pro, pulse_hobby, pulse_pro, scale,
} from "../autumn.config";
import { calculateTopupCost, TOPUP_FEATURE_ID, TOPUP_TIERS } from "./topup-math";

describe("fixed investigation purchases", () => {
	test("card displays one dollar per unit and sends only valid, authorized purchases to Autumn", async () => {
		// Bun module mocks persist across tests; isolate the card's hook mocks.
		const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
			cwd: import.meta.dir,
			env: { NODE_ENV: "test", TZ: "UTC" },
			stdin: new Blob([`
import assert from "node:assert/strict";
import { mock } from "bun:test";
const React = await import("react");
let state, cursor, canUserUpgrade;
const attach = mock(async () => {});
mock.module("react", () => ({ ...React, useState: () => [state[cursor++], () => {}], useEffect: () => {} }));
mock.module("autumn-js/react", () => ({ useCustomer: () => ({ attach }) }));
mock.module("@/components/providers/billing-provider", () => ({
  useBillingContext: () => ({ canUserUpgrade, isFeatureEnabled: () => true, isLoading: false }),
  useInvestigationUsage: () => ({ fixedPrice: true, balance: 0, payAsYouGo: false, overageAllowed: false, unlimited: false, monthly: [], prepaid: [], usagePrices: [] }),
}));
globalThis.window = { location: { origin: "https://dashboard.example" } };
globalThis.fetch = () => { throw new Error("Unexpected network request"); };
const { InvestigationTopupCard } = await import("../app/(main)/billing/components/investigation-topup-card");
for (const [quantity, valid, authorized] of [
  [1, true, true], [10, true, true], [137, true, true], [1000, true, true],
  [0, false, true], [-1, false, true], [0.5, false, true], [1.5, false, true],
  [1001, false, true], [NaN, false, true], [Infinity, false, true], [10, true, false],
]) {
  state = [String(quantity), false, true];
  cursor = 0;
  canUserUpgrade = authorized;
  attach.mockClear();
  const pending = [InvestigationTopupCard()];
  let button;
  while (pending.length) {
    const element = pending.pop();
    if (!React.isValidElement(element)) continue;
    if (element.props.onClick && typeof element.props.children === "string" && element.props.children.startsWith("Buy")) button = element;
    pending.push(...React.Children.toArray(element.props.children));
  }
  assert.ok(button, \`Purchase button for quantity \${quantity}\`);
  assert.equal(button.props.disabled, !(valid && authorized));
  assert.equal(button.props.children, valid ? \`Buy \${quantity} investigations · $\${quantity.toFixed(2)}\` : "Buy investigations");
  await button.props.onClick();
  assert.deepEqual(attach.mock.calls, valid && authorized ? [[{
    planId: "investigations_topup",
    featureQuantities: [{ featureId: "investigation_runs", quantity }],
    successUrl: "https://dashboard.example/billing",
  }]] : []);
}
			`]),
			stdout: "ignore",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);
		expect(exitCode, stderr).toBe(0);
	});

	test("new catalog item is prepaid without a reset, expiration, or volume discount", () => {
		expect(investigation_runs).toMatchObject({ id: INVESTIGATION_USAGE.featureId, type: "metered", consumable: true });
		expect(investigations_topup).toMatchObject({ addOn: true, autoEnable: false });
		expect(investigations_topup.items).toEqual([{
			featureId: "investigation_runs",
			price: { amount: 1, interval: "one_off", billingMethod: "prepaid", billingUnits: 1, maxPurchase: 1000 },
		}]);
	});

	test("every plan grants agent credits and none include chat as an entitlement", () => {
		const allowances: [{ items?: { featureId?: string; included?: number }[] }, number[]][] = [
			[free, [10]],
			[hobby, [20, 1]],
			[pro, [350, 5]],
			[intelligence, [1500]],
			[intelligence_scale, [5000]],
		];
		for (const [plan, included] of allowances) {
			expect(
				plan.items
					?.filter((item) => item.featureId === "agent_credits")
					.map((item) => item.included)
			).toEqual(included);
			expect(plan.items?.some((item) => item.featureId === "databunny_chat")).toBe(false);
		}
	});

	test("analytics plans do not promise included automatic investigations", () => {
		for (const plan of [free, hobby, pro]) {
			expect(plan.items?.filter((item) => item.featureId === "investigation_runs")).toEqual([
			{ featureId: "investigation_runs", included: 0, reset: { interval: "one_off" } },
		]);
		}
	});

	test.each([
		[intelligence, INVESTIGATION_ALLOWANCES.intelligence, 299],
		[intelligence_scale, INVESTIGATION_ALLOWANCES.intelligence_scale, 799],
	] as const)("%s grants monthly investigations and bills only extras at one dollar", (plan, included, basePrice) => {
		expect(plan.price).toEqual({ amount: basePrice, interval: "month" });
		expect(plan.items?.filter((item) => item.featureId === INVESTIGATION_USAGE.featureId)).toEqual([{
			featureId: INVESTIGATION_USAGE.featureId,
			included,
			price: { amount: 1, interval: "month", billingMethod: "usage_based", billingUnits: 1 },
		}]);
		expect(plan.autoEnable).toBe(false);
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
	test("zero fixed balance remains fixed instead of falling back to available AI credits", () => {
		expect(getInvestigationBillingFeatureId({ investigation_runs: { remaining: 0 }, agent_credits: { remaining: 500 } })).toBe("investigation_runs");
		expect(getInvestigationBillingFeatureId({ investigation_runs: { remaining: 10 } })).toBe("investigation_runs");
	});

	test("absence retains legacy terms, while inherited properties do not grant an entitlement", () => {
		for (const balances of [undefined, null, {}, { agent_credits: { remaining: 100 } }, Object.create({ investigation_runs: { remaining: 5 } })]) {
			expect(getInvestigationBillingFeatureId(balances)).toBe("agent_credits");
		}
	});
});
