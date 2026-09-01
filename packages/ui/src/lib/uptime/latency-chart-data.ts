export interface ChartDataPoint {
	avg_response_time: number | null;
	date: string;
	p95_response_time: number | null;
}

export const CHART_BLOCK_MIN_PX = 140;

export const METRICS = [
	{
		key: "avg_response_time",
		label: "Avg",
		color: "var(--color-chart-4)",
	},
	{
		key: "p95_response_time",
		label: "P95",
		color: "var(--color-chart-3)",
	},
] as const;

export function formatMs(ms: number): string {
	if (ms >= 1000) {
		return `${(ms / 1000).toFixed(1)}s`;
	}
	return `${Math.round(ms)}ms`;
}
