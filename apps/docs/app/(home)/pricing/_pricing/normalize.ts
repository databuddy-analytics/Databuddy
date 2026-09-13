import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import type { RawItem, RawPlan } from "../data";
import type { NormalizedPlan } from "./types";

function getPriceMonthly(items: RawItem[]): number {
	for (const item of items) {
		if (item.type === "price") {
			return item.price;
		}
	}
	return 0;
}

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

function getAgentCreditsByInterval(
	items: RawItem[],
	interval: "day" | "month"
): number | null {
	for (const item of items) {
		const isAgent =
			(item.type === "feature" || item.type === "priced_feature") &&
			item.feature_id === "agent_credits" &&
			item.interval === interval &&
			typeof item.included_usage === "number";
		if (isAgent) {
			return item.included_usage as number;
		}
	}
	return null;
}

export function normalizePlans(raw: RawPlan[]): NormalizedPlan[] {
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
				agentCreditsMonthly: null,
				agentCreditsDaily: null,
			};
		}

		const priceMonthly = getPriceMonthly(plan.items);
		const { included: includedEventsMonthly, tiers: eventTiers } =
			getEventsInfo(plan.items);
		const agentCreditsMonthly = getAgentCreditsByInterval(plan.items, "month");
		const agentCreditsDaily = getAgentCreditsByInterval(plan.items, "day");
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
			agentCreditsMonthly,
			agentCreditsDaily,
		};
	});
}
