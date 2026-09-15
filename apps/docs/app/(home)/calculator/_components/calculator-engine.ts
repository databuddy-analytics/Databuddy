export interface CalculatorInputs {
	monthlyVisitors: number;
	revenuePerConversion: number;
	visitorDataLossRate: number;
	visitorToPaidRate: number;
}

export function calculateCookieBannerCost(inputs: CalculatorInputs) {
	const lostVisitors = inputs.monthlyVisitors * inputs.visitorDataLossRate;
	const lostConversions = lostVisitors * inputs.visitorToPaidRate;
	const lostRevenueMonthly = lostConversions * inputs.revenuePerConversion;
	return {
		lostVisitors,
		lostConversions,
		lostRevenueMonthly,
		lostRevenueYearly: lostRevenueMonthly * 12,
	};
}

export function formatCurrencyFull(value: number): string {
	return `$${Math.round(value).toLocaleString()}`;
}

export function formatNumber(value: number): string {
	return Math.round(value).toLocaleString();
}

export function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}
