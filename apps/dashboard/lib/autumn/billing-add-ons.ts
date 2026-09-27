import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import type { useListPlans, UseCustomerResult } from "autumn-js/react";
import { TOPUP_PRODUCT_ID } from "@/lib/topup-math";

type Plan = NonNullable<ReturnType<typeof useListPlans>["data"]>[number];
type Subscription = NonNullable<
	UseCustomerResult["data"]
>["subscriptions"][number];

export function isManageableAddOn(subscription: Pick<Subscription, "status">) {
	return ["active", "past_due", "scheduled"].includes(subscription.status);
}

export function getBillingAddOns(
	plans: Plan[],
	subscriptions: Subscription[],
	{ hideCreditOffers, isFree }: { hideCreditOffers: boolean; isFree: boolean }
) {
	const attached = subscriptions.filter(
		(subscription) => subscription.addOn && isManageableAddOn(subscription)
	);
	const available = new Map(
		plans.filter((plan) => plan.addOn).map((plan) => [plan.id, plan])
	);
	for (const subscription of attached) {
		if (subscription.plan) {
			available.set(subscription.planId, subscription.plan);
		}
	}
	return [...available.values()].flatMap((plan) => {
		if (
			plan.id.toLowerCase().includes("sso") ||
			plan.name.toLowerCase().includes("single sign-on") ||
			plan.id === TOPUP_PRODUCT_ID ||
			plan.id === INVESTIGATION_USAGE.topupPlanId
		) {
			return [];
		}
		const subscription = attached.find((entry) => entry.planId === plan.id);
		if (
			!subscription &&
			(isFree || (hideCreditOffers && plan.id === "credits_booster"))
		) {
			return [];
		}
		return [{ plan, subscription }];
	});
}
