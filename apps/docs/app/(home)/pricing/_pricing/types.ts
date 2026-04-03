export interface NormalizedPlan {
	assistantMessagesPerDay: number | null;
	eventTiers: Array<{ to: number | "inf"; amount: number }> | null;
	id: string;
	includedEventsMonthly: number;
	name: string;
	priceMonthly: number;
}
