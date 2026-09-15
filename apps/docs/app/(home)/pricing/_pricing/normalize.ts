import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import type { RawItem, RawPlan } from "../data";

function getEventsInfo(items: RawItem[]): {
	included: number;
	tiers: Array<{ to: number | "inf"; amount: number }> | null;
} {
	let included = 0;
	let tiers: Array<{ to: number | "inf"; amount: number }> | null = null;
	for (const item of items) {
		const isEvent =
			(item.type === "feature" || item.type === "priced_feature") &&
			item.feature_id === "events";
		if (!isEvent) {
			continue;
		}
		if (typeof item.included_usage === "number") {
			included = item.included_usage;
		}
		if (item.type === "priced_feature" && item.tiers) {
			tiers = item.tiers;
		}
	}
	return {
		included,
		// Catalog ceilings are total monthly events; the estimator takes overage events.
		tiers:
			tiers
				?.filter((tier) => tier.to === "inf" || tier.to > included)
				.map((tier) => ({
					...tier,
					to: tier.to === "inf" ? "inf" : tier.to - included,
				})) ?? null,
	};
}

export type NormalizedPlan = ReturnType<typeof normalizePlans>[number];

export function normalizePlans(raw: RawPlan[]) {
	return raw.map((plan) => {
		if (plan.id === "enterprise") {
			return {
				id: plan.id,
				name: plan.name,
				priceMonthly: 0,
				includedEventsMonthly: 0,
				includedInvestigationsMonthly: null,
				investigationPrice: null,
				eventTiers: null,
				chatIncluded: plan.chatIncluded,
			};
		}

		const priceMonthly =
			plan.items.find((item) => item.type === "price")?.price ?? 0;
		const { included: includedEventsMonthly, tiers: eventTiers } =
			getEventsInfo(plan.items);
		const investigations = plan.items.find(
			(item) =>
				item.type === "priced_feature" &&
				item.feature_id === INVESTIGATION_USAGE.featureId &&
				item.interval === "month"
		);
		return {
			id: plan.id,
			name: plan.name,
			priceMonthly,
			includedEventsMonthly,
			includedInvestigationsMonthly:
				investigations?.type === "priced_feature" &&
				typeof investigations.included_usage === "number"
					? investigations.included_usage
					: null,
			investigationPrice:
				investigations?.type === "priced_feature"
					? (investigations.price ?? null)
					: null,
			eventTiers,
			chatIncluded: plan.chatIncluded,
		};
	});
}
