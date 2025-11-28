import { estimateTieredOverageCostFromTiers } from "./estimator-utils";
import type { NormalizedPlan } from "./types";

function calculateTotalCost(
	plan: NormalizedPlan,
	monthlyEvents: number
): number | null {
	const basePrice = plan.priceMonthly;
	const included = plan.includedEventsMonthly;
	const overage = Math.max(monthlyEvents - included, 0);

	if (overage > 0 && !plan.eventTiers) {
		return null;
	}

	if (overage <= 0) {
		return basePrice;
	}

	const overageCost = estimateTieredOverageCostFromTiers(
		overage,
		plan.eventTiers ?? []
	);
	return basePrice + overageCost;
}

function findHighestTierPlan(plans: NormalizedPlan[]): NormalizedPlan | null {
	const paidPlansWithOverage = plans.filter((p) => p.eventTiers !== null);
	if (paidPlansWithOverage.length === 0) {
		return null;
	}
	return paidPlansWithOverage.reduce((max, plan) =>
		plan.includedEventsMonthly > max.includedEventsMonthly ? plan : max
	);
}

export function selectBestPlan(
	monthlyEvents: number,
	plans: NormalizedPlan[]
): NormalizedPlan | null {
	if (plans.length === 0) {
		return null;
	}

	const highestTier = findHighestTierPlan(plans);

	if (highestTier && monthlyEvents > highestTier.includedEventsMonthly) {
		return highestTier;
	}
	let bestPlan: NormalizedPlan | null = null;
	let bestCost = Number.POSITIVE_INFINITY;

	for (const plan of plans) {
		const totalCost = calculateTotalCost(plan, monthlyEvents);
		if (totalCost === null) {
			continue;
		}
		if (totalCost < bestCost) {
			bestCost = totalCost;
			bestPlan = plan;
		}
	}

	return bestPlan;
}

export function computeEnterpriseThreshold(plans: NormalizedPlan[]): number {
	const sorted = [...plans].sort(
		(a, b) => a.includedEventsMonthly - b.includedEventsMonthly
	);
	const maxPlan = sorted.at(-1);
	if (!maxPlan?.eventTiers) {
		return Number.POSITIVE_INFINITY;
	}
	let highest = 0;
	for (const tier of maxPlan.eventTiers) {
		if (tier.to === "inf") {
			continue;
		}
		const toNum = Number(tier.to);
		if (Number.isFinite(toNum)) {
			highest = Math.max(highest, toNum);
		}
	}
	return highest > 0 ? highest : Number.POSITIVE_INFINITY;
}

export function displayNameForPlan(
	monthlyEvents: number,
	plans: NormalizedPlan[],
	bestPlan: NormalizedPlan | null
): string {
	const threshold = computeEnterpriseThreshold(plans);
	if (monthlyEvents > threshold) {
		return "Enterprise";
	}
	return bestPlan ? bestPlan.name : "Free";
}
