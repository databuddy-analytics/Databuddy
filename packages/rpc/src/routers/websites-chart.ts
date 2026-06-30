interface MiniChartDataPoint {
	date: string;
	value: number;
}

export interface ProcessedMiniChartData {
	data: MiniChartDataPoint[];
	hasAnyData: boolean;
	hasHistoricalData: boolean;
	totalViews: number;
	trend: {
		type: "up" | "down" | "neutral";
		value: number;
	} | null;
}

export interface ChartDataRow {
	date: string;
	hasAnyData: number;
	value: number;
	websiteId: string;
}

const TREND_THRESHOLD = 5;

const average = (values: { value: number }[]) =>
	values.length > 0
		? values.reduce((sum, item) => sum + item.value, 0) / values.length
		: 0;

export const calculateTrend = (
	dataPoints: { date: string; value: number }[]
) => {
	if (!dataPoints?.length || dataPoints.length < 4) {
		return null;
	}

	const midPoint = Math.floor(dataPoints.length / 2);
	const firstHalf = dataPoints.slice(0, midPoint);
	const secondHalf = dataPoints.slice(midPoint);

	const previousAverage = average(firstHalf);
	const currentAverage = average(secondHalf);

	if (previousAverage === 0) {
		return currentAverage > 0
			? { type: "up" as const, value: 100 }
			: { type: "neutral" as const, value: 0 };
	}

	const percentageChange =
		((currentAverage - previousAverage) / previousAverage) * 100;

	if (percentageChange > TREND_THRESHOLD) {
		return { type: "up" as const, value: Math.abs(percentageChange) };
	}
	if (percentageChange < -TREND_THRESHOLD) {
		return { type: "down" as const, value: Math.abs(percentageChange) };
	}
	return { type: "neutral" as const, value: Math.abs(percentageChange) };
};

export function processChartData(
	websiteIds: string[],
	queryResults: ChartDataRow[],
	historicalRows: { websiteId: string }[]
): Record<string, ProcessedMiniChartData> {
	const historicalIds = new Set(historicalRows.map((r) => r.websiteId));

	const grouped: Record<
		string,
		{ points: { date: string; value: number }[]; hasAnyData: boolean }
	> = {};
	for (const id of websiteIds) {
		grouped[id] = { points: [], hasAnyData: false };
	}

	for (const row of queryResults) {
		const entry = grouped[row.websiteId];
		if (!entry) {
			continue;
		}
		entry.points.push({ date: row.date, value: row.value });
		if (row.hasAnyData === 1) {
			entry.hasAnyData = true;
		}
	}

	const result: Record<string, ProcessedMiniChartData> = {};
	for (const id of websiteIds) {
		const { points, hasAnyData } = grouped[id];
		result[id] = {
			data: points,
			totalViews: points.reduce((sum, p) => sum + p.value, 0),
			hasAnyData,
			hasHistoricalData: historicalIds.has(id),
			trend: calculateTrend(points),
		};
	}
	return result;
}
