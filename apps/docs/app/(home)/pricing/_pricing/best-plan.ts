import { estimateTieredOverageCostFromTiers } from "./estimator-utils";
import type { NormalizedPlan } from "./types";

export function calculateTotalCost(
	plan: NormalizedPlan,
	monthlyEvents: number,
	monthlyInvestigations = 0
): number | null {
	if (plan.id === "enterprise") {
		return null;
	}
	if (
		monthlyInvestigations > 0 &&
		(plan.includedInvestigationsMonthly === null ||
			plan.investigationPrice === null)
	) {
		return null;
	}
	const investigationCost =
		Math.max(
			monthlyInvestigations - (plan.includedInvestigationsMonthly ?? 0),
			0
		) * (plan.investigationPrice ?? 0);
	const basePrice = plan.priceMonthly;
	const included = plan.includedEventsMonthly;
	const overage = Math.max(monthlyEvents - included, 0);

	if (overage > 0 && !plan.eventTiers) {
		return null;
	}

	if (overage <= 0) {
		return basePrice + investigationCost;
	}

	const overageCost = estimateTieredOverageCostFromTiers(
		overage,
		plan.eventTiers ?? []
	);
	return basePrice + overageCost + investigationCost;
}

export function selectBestPlan(
	monthlyEvents: number,
	plans: NormalizedPlan[],
	monthlyInvestigations = 0
): NormalizedPlan | null {
	if (plans.length === 0) {
		return null;
	}

	let bestPlan: NormalizedPlan | null = null;
	let bestCost = Number.POSITIVE_INFINITY;

	for (const plan of plans) {
		const totalCost = calculateTotalCost(
			plan,
			monthlyEvents,
			monthlyInvestigations
		);
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

function computeEnterpriseThreshold(plans: NormalizedPlan[]): number {
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
	return highest > 0
		? highest + maxPlan.includedEventsMonthly
		: Number.POSITIVE_INFINITY;
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
