export const formatPerformanceTime = (value: number): string => {
	if (!value || value === 0) {
		return "N/A";
	}
	if (value < 1000) {
		return `${Math.round(value)}ms`;
	}
	const seconds = Math.round(value / 100) / 10;
	return seconds % 1 === 0
		? `${seconds.toFixed(0)}s`
		: `${seconds.toFixed(1)}s`;
};

export const formatNumber = (value: number | null | undefined): string => {
	if (value == null || Number.isNaN(value)) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
};

export const getPerformanceRating = (
	score: number
): { rating: string; className: string } => {
	if (typeof score !== "number" || Number.isNaN(score)) {
		return { rating: "Unknown", className: "text-muted-foreground" };
	}
	if (score >= 90) {
		return { rating: "Excellent", className: "text-green-600" };
	}
	if (score >= 70) {
		return { rating: "Good", className: "text-green-600" };
	}
	if (score >= 50) {
		return { rating: "Moderate", className: "text-yellow-600" };
	}
	if (score >= 30) {
		return { rating: "Poor", className: "text-orange-600" };
	}
	return { rating: "Very Poor", className: "text-red-600" };
};

export const getMetricStyles = (value: number, type: "time" | "cls") => {
	if (type === "cls") {
		return {
			colorClass:
				value < 0.1
					? "text-green-600"
					: value < 0.25
						? "text-yellow-600"
						: "text-red-600",
			isGood: value < 0.1,
			isPoor: value >= 0.25,
		};
	}

	return {
		colorClass:
			value < 1000
				? "text-green-600"
				: value < 3000
					? "text-yellow-600"
					: "text-red-600",
		isGood: value < 1000,
		isPoor: value >= 3000,
	};
};

export const getPerformanceColor = (avgLoadTime: number): string =>
	avgLoadTime < 1500
		? "text-green-600"
		: avgLoadTime < 3000
			? "text-yellow-600"
			: "text-red-600";

export const getPerformanceScoreColor = (score: number): string =>
	score >= 80
		? "text-green-600"
		: score >= 60
			? "text-yellow-600"
			: "text-red-600";
