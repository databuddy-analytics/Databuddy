import { describe, expect, test } from "bun:test";
import { getSubscriptionPriceText } from "./subscription-price";

type Plan = NonNullable<
	NonNullable<Parameters<typeof getSubscriptionPriceText>[0]>["plan"]
>;

function plan(price: Plan["price"]): Plan {
	return {
		id: "intelligence", name: "Business", description: null, group: null,
		version: 1, addOn: false, autoEnable: false, price, items: [],
		createdAt: 0, env: "sandbox", archived: false,
	};
}

describe("attached subscription price", () => {
	test("missing expanded terms do not claim a public catalog price", () => {
		expect(getSubscriptionPriceText({})).toBeNull();
		expect(getSubscriptionPriceText(undefined)).toBeNull();
	});

	test("a complimentary base does not imply usage is free", () => {
		expect(getSubscriptionPriceText({ plan: plan(null) })).toBe("No base subscription fee");
	});

	test("custom zero and nonzero prices work without optional provider display", () => {
		expect(getSubscriptionPriceText({ plan: plan({ amount: 0, interval: "month" }) })).toBe("$0.00 / month");
		expect(getSubscriptionPriceText({ plan: plan({ amount: 25, interval: "month", intervalCount: 3 }) })).toBe("$25.00 / 3 months");
	});

	test("preserves complete native display terms", () => {
		expect(getSubscriptionPriceText({ plan: plan({ amount: 15, interval: "month", display: { primaryText: "$15", secondaryText: "per month" } }) })).toBe("$15 per month");
	});
});
