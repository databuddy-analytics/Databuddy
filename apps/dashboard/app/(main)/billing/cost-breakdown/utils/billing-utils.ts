export const EVENT_COST = 0.000_035;

export type OverageInfo = {
	hasOverage: boolean;
	overageEvents: number;
	includedEvents: number;
};

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
	return overageInfo.overageEvents * ratio * EVENT_COST;
}
