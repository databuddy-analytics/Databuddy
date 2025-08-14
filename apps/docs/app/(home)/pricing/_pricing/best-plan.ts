import type { NormalizedPlan } from './types';

export function selectBestPlan(
	monthlyEvents: number,
	plans: NormalizedPlan[]
): NormalizedPlan | null {
	const sorted = [...plans].sort(
		(a, b) => a.includedEventsMonthly - b.includedEventsMonthly
	);
	const cover = sorted.find((p) => monthlyEvents <= p.includedEventsMonthly);
	if (cover) {
		return cover;
	}
	return sorted.at(-1) ?? null;
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
		if (tier.to === 'inf') {
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
		return 'Enterprise';
	}
	return bestPlan ? bestPlan.name : 'Free';
}
