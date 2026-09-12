import { describe, expect, test } from "vitest";
import { isInvestigationPurchaseValid } from "./investigation-purchase";

const purchase = (quantity: unknown) => ({
	planId: "investigations_topup",
	featureQuantities: [{ featureId: "investigation_runs", quantity }],
});

describe("investigation checkout validation", () => {
	test.each([1, 37, 1000])("accepts %i whole units only on supported checkout routes", (quantity) => {
		expect(isInvestigationPurchaseValid(purchase(quantity), "attach")).toBe(true);
		expect(isInvestigationPurchaseValid(purchase(quantity), "previewAttach")).toBe(true);
	});
	test.each([0, 0.5, -1, 1001, "10", null, undefined])("rejects invalid quantities", (quantity) => {
		expect(isInvestigationPurchaseValid(purchase(quantity), "attach")).toBe(false);
	});
	test.each([
		"customerId", "entityId", "freeTrial", "discounts", "version", "customize",
		"customPlan", "invoiceMode", "noBillingChanges", "customLineItems",
		"carryOverBalances", "carryOverUsages", "subscriptionId", "planSchedule",
		"startsAt", "endsAt", "newBillingSubscription", "processorSubscriptionId",
		"feature_quantities", "productId", "plan_id", "product_id",
	])("rejects client-controlled override field %s", (key) => {
		expect(isInvestigationPurchaseValid({ ...purchase(10), [key]: "override" }, "attach")).toBe(false);
	});
	test.each(["plan_id", "productId", "product_id"])("rejects legacy alias %s instead of bypassing fixed-unit validation", (key) => {
		expect(isInvestigationPurchaseValid({ [key]: "investigations_topup" }, "attach")).toBe(false);
	});
	test.each(["multiAttach", "previewMultiAttach", "updateSubscription", "previewUpdateSubscription", "setupPayment"])("rejects purchases through unsupported route %s", (route) => {
		expect(isInvestigationPurchaseValid(purchase(10), route)).toBe(false);
		for (const collection of ["plans", "products"]) {
			expect(isInvestigationPurchaseValid({ [collection]: [purchase(10)] }, route)).toBe(false);
			expect(isInvestigationPurchaseValid({ [collection]: [{ product_id: "investigations_topup" }] }, route)).toBe(false);
		}
	});
	test("requires one unmodified feature quantity and preserves unrelated SKU validation", () => {
		expect(isInvestigationPurchaseValid({ planId: "investigations_topup" }, "attach")).toBe(false);
		expect(isInvestigationPurchaseValid({ planId: "investigations_topup", featureQuantities: [{ featureId: "agent_credits", quantity: 10 }] }, "attach")).toBe(false);
		expect(isInvestigationPurchaseValid({ planId: "investigations_topup", featureQuantities: [...purchase(5).featureQuantities, ...purchase(5).featureQuantities] }, "attach")).toBe(false);
		expect(isInvestigationPurchaseValid({ planId: "investigations_topup", featureQuantities: [{ featureId: "investigation_runs", quantity: 10, price: 0 }] }, "attach")).toBe(false);
		expect(isInvestigationPurchaseValid({ planId: "credits_topup", featureQuantities: [{ featureId: "agent_credits", quantity: 2500 }] }, "attach")).toBe(true);
		expect(isInvestigationPurchaseValid({ plans: [{ planId: "pro" }, { planId: "credits_topup" }], discounts: [] }, "multiAttach")).toBe(true);
	});
	test.each([
		{ planId: "pro", customize: { addItems: [{ featureId: "investigation_runs", included: 1000 }] } },
		{ planId: "pro", customize: { items: [{ featureId: "investigation_runs", unlimited: true }] } },
		{ planId: "pro", featureQuantities: [{ featureId: "investigation_runs", quantity: 1000 }] },
		{ plans: [{ planId: "pro", customize: { items: [{ featureId: "investigation_runs", included: 1000 }] } }] },
		{ subscriptionId: "subscription", customize: { add_items: [{ feature_id: "investigation_runs", included: 1000 }] } },
		{ subscriptionId: "subscription", carryOverBalances: { enabled: true, featureIds: ["investigation_runs"] } },
	])("rejects investigation grants through another plan or subscription", (body) => {
		for (const route of ["attach", "previewAttach", "multiAttach", "updateSubscription", "setupPayment"]) {
			expect(isInvestigationPurchaseValid(body, route)).toBe(false);
		}
	});
});
