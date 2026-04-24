import type { RawItem, RawPlan } from "../data";
import type { NormalizedPlan } from "./types";

export function getPriceMonthly(items: RawItem[]): number {
	for (const item of items) {
		if (item.type === "price") {
			return item.price;
		}
	}
	return 0;
}

export function getEventsInfo(items: RawItem[]): {
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
	return { included, tiers };
}

export function getAgentCreditsByInterval(
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
		return {
			id: plan.id,
			name: plan.name,
			priceMonthly,
			includedEventsMonthly,
			eventTiers,
			agentCreditsMonthly,
			agentCreditsDaily,
		};
	});
}
