import { useMemo } from "react";
import {
	createMetricToggles,
	formatDateByGranularity,
} from "./analytics-helpers";

export type ChartMetric =
	| "pageviews"
	| "visitors"
	| "sessions"
	| "bounce_rate"
	| string;

export type MetricColors = Record<ChartMetric, string>;

export type ChartDataPoint = {
	[key: string]: any;
	date: string;
};

interface UseChartConfigOptions {
	data?: ChartDataPoint[];
	initialVisibleMetrics?: ChartMetric[];
	granularity?: "daily" | "hourly";
	colors?: Partial<MetricColors>;
}

export function useChartConfig({
	data = [],
	initialVisibleMetrics = ["pageviews", "visitors", "sessions"],
	granularity = "daily",
	colors = {},
}: UseChartConfigOptions = {}) {
	// Default colors for metrics
	const defaultColors: MetricColors = {
		pageviews: "blue-500",
		visitors: "emerald-500",
		sessions: "amber-500",
		bounce_rate: "red-500",
	};

	// Merge default colors with provided colors
	const metricColors = useMemo(
		() => ({
			...defaultColors,
			...colors,
		}),
		[colors]
	);

	// Create initial metric visibility state
	const initialToggles = useMemo(
		() => createMetricToggles(initialVisibleMetrics),
		[initialVisibleMetrics]
	);

	// Format chart data with dates
	const formattedData = useMemo(
		() =>
			data.map((item) => ({
				...item,
				formattedDate: formatDateByGranularity(item.date, granularity),
			})),
		[data, granularity]
	);

	// Create metric labels mapping
	const metricLabels = useMemo(
		() => ({
			pageviews: "Pageviews",
			visitors: "Visitors",
			sessions: "Sessions",
			bounce_rate: "Bounce Rate",
		}),
		[]
	);

	return {
		metricColors,
		metricLabels,
		initialToggles,
		formattedData,
	};
}
