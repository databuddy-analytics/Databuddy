import { formatCurrency, formatMetricNumber } from "@/lib/formatters";

interface PivotRow {
	date: string;
	[key: string]: string | number | null | undefined;
}

interface TimeSeriesPivotInput {
	date: string;
	seriesKey: string;
	value: number;
}

export const formatDurationMs = (value?: number) => {
	if (value === undefined || value === null || Number.isNaN(value)) {
		return "0ms";
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(2)}s`;
	}
	return `${Math.round(value)}ms`;
};

export const formatPercent = (value?: number) => {
	if (value === undefined || value === null || Number.isNaN(value)) {
		return "0%";
	}
	return `${(value * 100).toFixed(1)}%`;
};

export const formatTokenCount = (value?: number) =>
	value === undefined || value === null ? "0" : formatMetricNumber(value);

export const formatUsd = (value?: number) =>
	value === undefined || value === null ? "$0.00" : formatCurrency(value);

export const pivotTimeSeries = (
	rows: TimeSeriesPivotInput[],
	options?: { maxSeries?: number }
) => {
	const seriesTotals = new Map<string, number>();

	for (const row of rows) {
		seriesTotals.set(
			row.seriesKey,
			(seriesTotals.get(row.seriesKey) ?? 0) + row.value
		);
	}

	const sortedSeries = Array.from(seriesTotals.entries())
		.sort((a, b) => b[1] - a[1])
		.slice(0, options?.maxSeries ?? 6)
		.map(([key]) => key);

	const byDate = new Map<string, PivotRow>();

	for (const row of rows) {
		if (!sortedSeries.includes(row.seriesKey)) {
			continue;
		}
		if (!byDate.has(row.date)) {
			byDate.set(row.date, { date: row.date });
		}
		const entry = byDate.get(row.date);
		if (entry) {
			entry[row.seriesKey] = row.value;
		}
	}

	return {
		seriesKeys: sortedSeries,
		data: Array.from(byDate.values()),
	};
};
