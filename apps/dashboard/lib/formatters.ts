// Helper function to format numbers with metric prefixes (K, M, B)
export const formatMetricNumber = (num: number | undefined | null): string => {
	if (num === undefined || num === null) {
		return '0';
	}

	// Handle edge case for non-numeric strings that might have been converted to NaN
	if (Number.isNaN(num)) {
		return '0';
	}

	if (Math.abs(num) >= 1_000_000_000) {
		return `${(num / 1_000_000_000).toFixed(1)}B`;
	}
	if (Math.abs(num) >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (Math.abs(num) >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	// Ensure small numbers are also returned as strings
	return num.toString();
};

// Format currency values
export const formatCurrency = (
	amount: number | undefined | null,
	currency = 'USD'
): string => {
	if (amount === undefined || amount === null || Number.isNaN(amount)) {
		return '$0.00';
	}

	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency,
	}).format(amount);
};

// Format regular numbers with commas
export const formatNumber = (num: number | undefined | null): string => {
	if (num === undefined || num === null || Number.isNaN(num)) {
		return '0';
	}

	return new Intl.NumberFormat('en-US').format(num);
};

// You can add other shared formatting functions here in the future
