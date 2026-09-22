export const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
};

// Format currency values
export const formatCurrency = (
	amount: number | undefined | null,
	currency = "USD"
): string => {
	if (amount === undefined || amount === null || Number.isNaN(amount)) {
		return "$0.00";
	}

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
	}).format(amount);
};
