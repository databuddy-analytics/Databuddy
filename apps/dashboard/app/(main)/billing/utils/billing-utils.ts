import {
	calculateGraduatedOverageCost,
	type PricingTier,
} from "./feature-usage";

export interface OverageInfo {
	hasOverage: boolean;
	includedEvents: number;
	overageEvents: number;
	pricingTiers: PricingTier[];
}

export function calculateOverageCost(
	eventCount: number,
	totalEvents: number,
	overageInfo: OverageInfo | null
): number {
	if (
		!overageInfo?.hasOverage ||
		totalEvents <= 0 ||
		eventCount <= 0 ||
		overageInfo.overageEvents <= 0
	) {
		return 0;
	}

	const ratio = eventCount / totalEvents;
	return (
		calculateGraduatedOverageCost(
			overageInfo.overageEvents,
			overageInfo.pricingTiers
		) * ratio
	);
}
