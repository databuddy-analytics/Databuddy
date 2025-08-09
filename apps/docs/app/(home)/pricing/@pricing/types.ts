export type NormalizedPlan = {
	id: string;
	name: string;
	priceMonthly: number;
	includedEventsMonthly: number;
	eventTiers: Array<{ to: number | 'inf'; amount: number }> | null;
	websitesIncluded: number | 'inf' | null;
	websitesOveragePerUnit: number | null;
	assistantMessagesPerDay: number | null;
};
