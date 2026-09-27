import type { UseCustomerResult } from "autumn-js/react";

type Subscription = NonNullable<
	UseCustomerResult["data"]
>["subscriptions"][number];

export function getSubscriptionPriceText(
	subscription: Pick<Subscription, "plan"> | null | undefined
): string | null {
	if (!subscription?.plan) {
		return null;
	}
	const price = subscription.plan.price;
	if (price === null) {
		return "No base subscription fee";
	}
	if (price.display?.primaryText) {
		return [price.display.primaryText, price.display.secondaryText]
			.filter(Boolean)
			.join(" ");
	}
	const amount = price.amount.toLocaleString("en-US", {
		style: "currency",
		currency: "USD",
	});
	if (price.interval === "one_off") {
		return `${amount} one time`;
	}
	const count = price.intervalCount ?? 1;
	if (price.interval === "semi_annual") {
		return `${amount} / ${6 * count} months`;
	}
	return `${amount} / ${count === 1 ? price.interval : `${count} ${price.interval}s`}`;
}
