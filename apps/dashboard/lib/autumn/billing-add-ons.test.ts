import { describe, expect, test } from "bun:test";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { TOPUP_PRODUCT_ID } from "@/lib/topup-math";
import { getBillingAddOns, isManageableAddOn } from "./billing-add-ons";
import { getSubscriptionPriceText } from "./subscription-price";

type Plan = Parameters<typeof getBillingAddOns>[0][number];
type Subscription = Parameters<typeof getBillingAddOns>[1][number];

const booster: Plan = {
	id: "credits_booster",
	name: "Credit Booster",
	description: null,
	group: null,
	version: 1,
	addOn: true,
	autoEnable: false,
	price: { amount: 29, interval: "month" },
	items: [],
	createdAt: 0,
	env: "sandbox",
	archived: false,
};

function attached(status: Subscription["status"] = "active"): Subscription {
	return {
		id: "booster-subscription.invalid",
		planId: booster.id,
		plan: { ...booster, price: { amount: 19, interval: "month" } },
		autoEnable: false,
		addOn: true,
		status,
		pastDue: status === "past_due",
		canceledAt: null,
		expiresAt: null,
		trialEndsAt: null,
		startedAt: 0,
		currentPeriodStart: 0,
		currentPeriodEnd: null,
		quantity: 1,
	};
}

const included = { hideCreditOffers: true, isFree: false };

describe("billing add-on management", () => {
	test("hides new credit offers for included chat or Intelligence and all unattached offers on Free", () => {
		const other = { ...booster, id: "synthetic_addon" };
		expect(getBillingAddOns([booster], [], included)).toEqual([]);
		expect(
			getBillingAddOns([booster, other], [], { ...included, isFree: true })
		).toEqual([]);
		expect(
			getBillingAddOns([booster], [], {
				hideCreditOffers: false,
				isFree: false,
			})[0]?.plan.id
		).toBe(booster.id);
		expect(
			getBillingAddOns([booster, other], [], included).map(
				({ plan }) => plan.id
			)
		).toEqual([other.id]);
	});

	test("keeps active, past-due, and scheduled boosters manageable on included Free and paid plans", () => {
		for (const status of ["active", "past_due", "scheduled"]) {
			const subscription = attached(status);
			for (const isFree of [false, true]) {
				const entries = getBillingAddOns([booster], [subscription], {
					...included,
					isFree,
				});
				expect(entries).toHaveLength(1);
				expect(entries[0]?.subscription).toBe(subscription);
				expect(isManageableAddOn(subscription)).toBe(true);
			}
		}
		for (const status of ["expired", "canceled"]) {
			expect(getBillingAddOns([booster], [attached(status)], included)).toEqual(
				[]
			);
		}
	});

	test("preserves attached terms even when the old add-on is absent from the sale catalog", () => {
		for (const amount of [0, 19]) {
			const subscription = attached();
			subscription.plan = {
				...booster,
				archived: true,
				price: { amount, interval: "month" },
			};
			for (const plans of [[], [booster]]) {
				const entry = getBillingAddOns(plans, [subscription], included)[0];
				expect(entry?.plan.price?.amount).toBe(amount);
				expect(getSubscriptionPriceText(entry?.subscription)).toBe(
					`$${amount.toFixed(2)} / month`
				);
			}
		}
	});

	test("does not replace unavailable attached pricing with the public sale price", () => {
		const subscription = attached();
		delete subscription.plan;
		const entry = getBillingAddOns([booster], [subscription], included)[0];
		expect(entry?.subscription).toBe(subscription);
		expect(getSubscriptionPriceText(entry?.subscription)).toBeNull();
	});

	test("keeps the existing SSO and one-off top-up exclusions", () => {
		const excluded = [
			"sso",
			TOPUP_PRODUCT_ID,
			INVESTIGATION_USAGE.topupPlanId,
		].map((id) => ({ ...booster, id }));
		expect(
			getBillingAddOns(excluded, [], { hideCreditOffers: false, isFree: false })
		).toEqual([]);
	});
});
