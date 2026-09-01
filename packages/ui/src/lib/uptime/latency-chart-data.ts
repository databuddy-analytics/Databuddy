export interface LatencyDataPoint {
	avg_response_time?: number;
	date: string;
	p50_response_time?: number;
	p95_response_time?: number;
}

export interface ChartDataPoint {
	avg_response_time: number | null;
	date: string;
	p95_response_time: number | null;
}

export const CHART_HEIGHT_PX = 140;
export const CHART_BLOCK_MIN_PX = CHART_HEIGHT_PX;

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

export function toChartData(data: LatencyDataPoint[]): ChartDataPoint[] {
	return data
		.filter((d) => d.avg_response_time != null || d.p95_response_time != null)
		.map((d) => ({
			date: d.date,
			avg_response_time:
				d.avg_response_time == null
					? null
					: Math.round(d.avg_response_time * 100) / 100,
			p95_response_time:
				d.p95_response_time == null
					? null
					: Math.round(d.p95_response_time * 100) / 100,
		}));
}

export function computeSummary(chartData: ChartDataPoint[]) {
	if (chartData.length === 0) {
		return { avg: null, p95: null };
	}
	const latest = chartData.at(-1);
	const avgValues = chartData
		.map((d) => d.avg_response_time)
		.filter((v): v is number => v != null);
	return {
		avg:
			avgValues.length > 0
				? avgValues.reduce((a, b) => a + b, 0) / avgValues.length
				: null,
		p95: latest?.p95_response_time ?? null,
	};
}

export function getSummaryValue(
	summary: { avg: number | null; p95: number | null },
	key: (typeof METRICS)[number]["key"]
) {
	return key === "avg_response_time" ? summary.avg : summary.p95;
}

export function detectGranularity(data: ChartDataPoint[]): "hourly" | "daily" {
	if (data.length < 2) {
		return "daily";
	}
	const first = new Date(data.at(0)?.date ?? "").getTime();
	const second = new Date(data.at(1)?.date ?? "").getTime();
	return (second - first) / (1000 * 60 * 60) < 20 ? "hourly" : "daily";
}

export function formatTickDate(
	dateStr: string,
	granularity: "hourly" | "daily"
): string {
	const d = new Date(dateStr);
	if (Number.isNaN(d.getTime())) {
		return dateStr;
	}
	if (granularity === "hourly") {
		return d.toLocaleString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			timeZone: "UTC",
		});
	}
	return d.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	});
}

export function getMetricLabel(dataKey: unknown) {
	if (typeof dataKey !== "string" && typeof dataKey !== "number") {
		return "";
	}

	return (
		METRICS.find((metric) => metric.key === dataKey)?.label ?? String(dataKey)
	);
}
