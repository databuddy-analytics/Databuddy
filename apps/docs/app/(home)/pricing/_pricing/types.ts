export interface NormalizedPlan {
	agentCreditsDaily: number | null;
	agentCreditsMonthly: number | null;
	eventTiers: Array<{ to: number | "inf"; amount: number }> | null;
	id: string;
	includedEventsMonthly: number;
	includedInvestigationsMonthly: number | null;
	investigationPrice: number | null;
	name: string;
	priceMonthly: number;
}
