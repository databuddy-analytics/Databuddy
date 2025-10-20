export const EVENT_COST = 0.000_035;

export interface OverageInfo {
	hasOverage: boolean;
	overageEvents: number;
	includedEvents: number;
}

export function calculateOverageCost(
	eventCount: number,
	totalEvents: number,
	overageInfo: OverageInfo | null
): number {
	if (!overageInfo?.hasOverage || totalEvents === 0) {
		return 0;
	}

	const eventTypeRatio = eventCount / totalEvents;
	const overageForThisType = overageInfo.overageEvents * eventTypeRatio;
	return Math.max(0, overageForThisType) * EVENT_COST;
}
