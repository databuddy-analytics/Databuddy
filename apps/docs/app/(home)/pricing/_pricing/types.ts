export interface NormalizedPlan {
	agentCreditsDaily: number | null;
	agentCreditsMonthly: number | null;
	eventTiers: Array<{ to: number | "inf"; amount: number }> | null;
	id: string;
	includedEventsMonthly: number;
	name: string;
	priceMonthly: number;
}
