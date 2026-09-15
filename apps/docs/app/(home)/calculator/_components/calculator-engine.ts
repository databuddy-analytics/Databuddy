export interface CalculatorInputs {
	monthlyVisitors: number;
	revenuePerConversion: number;
	visitorDataLossRate: number;
	visitorToPaidRate: number;
}

export const DEFAULT_INPUTS: CalculatorInputs = {
	monthlyVisitors: 50_000,
	visitorDataLossRate: 0.55,
	visitorToPaidRate: 0.015,
	revenuePerConversion: 50,
};

export function readCalculatorInputs(
	params: Record<string, string | string[] | undefined>
): CalculatorInputs | undefined {
	const values = [
		params.visitors,
		params.unmeasured,
		params.conversion,
		params.value,
	];
	const limits = [2_000_000, 0.75, 0.05, 1000];
	if (
		!values.every(
			(value, index) =>
				typeof value === "string" &&
				value.trim() !== "" &&
				Number.isFinite(Number(value)) &&
				Number(value) >= 0 &&
				Number(value) <= limits[index]
		)
	) {
		return;
	}
	const [
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	] = values.map(Number);
	return {
		monthlyVisitors,
		visitorDataLossRate,
		visitorToPaidRate,
		revenuePerConversion,
	};
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
	return `$${value.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value: number): string {
	return Math.round(value).toLocaleString();
}

export function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}
