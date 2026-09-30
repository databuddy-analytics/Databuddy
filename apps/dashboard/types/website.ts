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
