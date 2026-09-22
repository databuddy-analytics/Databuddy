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
