import dayjs from "@/lib/dayjs";

export const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
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

// Predefined date formats for consistency across the app
export const DATE_FORMATS = {
	DATE_ONLY: "MMM D, YYYY", // Jul 6, 2025
	DATE_TIME: "MMM D, YYYY HH:mm", // Jul 6, 2025 14:30
	DATE_TIME_SECONDS: "MMM D, YYYY HH:mm:ss", // Jul 6, 2025 14:30:25
	DATE_MONTH_DAY: "MMM D", // Jul 6
	ISO_DATE: "YYYY-MM-DD", // 2025-07-06
	TIME_ONLY: "HH:mm", // 14:30
	DATE_TIME_NO_YEAR: "MMM D, HH:mm", // Jul 6, 14:30
	DATE_TIME_12H: "MMM D, YYYY h:mm A", // Jul 6, 2025 2:30 PM
} as const;

// Global date formatting functions
export const formatDate = (
	dateString: string | Date | undefined | null,
	format: string = DATE_FORMATS.DATE_ONLY
): string => {
	if (!dateString) {
		return "";
	}

	try {
		const date = dayjs(dateString);
		if (!date.isValid()) {
			console.warn("Invalid date:", dateString);
			return "";
		}
		return date.format(format);
	} catch (error) {
		console.warn("Failed to format date:", dateString, error);
		return "";
	}
};

// Helper function for date ranges
export const formatDateRange = (
	startDate: string | Date | undefined | null,
	endDate: string | Date | undefined | null,
	format: string = DATE_FORMATS.DATE_ONLY
): string => {
	const start = formatDate(startDate, format);
	const end = formatDate(endDate, format);

	if (!(start && end)) {
		return "";
	}
	if (start === end) {
		return start;
	}

	return `${start} - ${end}`;
};
