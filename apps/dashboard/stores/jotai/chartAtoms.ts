import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface MetricVisibilityState {
	bounce_rate: boolean;
	median_session_duration: boolean;
	pageviews: boolean;
	sessions: boolean;
	visitors: boolean;
}

const defaultVisibleMetrics: MetricVisibilityState = {
	pageviews: true,
	visitors: true,
	sessions: false,
	bounce_rate: false,
	median_session_duration: false,
};

export const metricVisibilityAtom = atomWithStorage<MetricVisibilityState>(
	"databuddy-metric-visibility",
	defaultVisibleMetrics
);

export const toggleMetricAtom = atom(
	null,
	(_, set, metric: keyof MetricVisibilityState) => {
		set(metricVisibilityAtom, (prev) => ({
			...prev,
			[metric]: !prev[metric],
		}));
	}
);

export const visibleMetricsAtom = atom((get) => {
	const visibility = get(metricVisibilityAtom);
	return Object.entries(visibility)
		.filter(([, isVisible]) => isVisible)
		.map(([metric]) => metric);
});

export interface RevenueMetricVisibilityState {
	avg_transaction: boolean;
	customers: boolean;
	refunds: boolean;
	revenue: boolean;
	transactions: boolean;
}

const defaultRevenueVisibleMetrics: RevenueMetricVisibilityState = {
	revenue: true,
	transactions: true,
	avg_transaction: false,
	customers: false,
	refunds: false,
};

export const revenueMetricVisibilityAtom =
	atomWithStorage<RevenueMetricVisibilityState>(
		"databuddy-revenue-metric-visibility",
		defaultRevenueVisibleMetrics
	);

export const toggleRevenueMetricAtom = atom(
	null,
	(_, set, metric: keyof RevenueMetricVisibilityState) => {
		set(revenueMetricVisibilityAtom, (prev) => ({
			...prev,
			[metric]: !prev[metric],
		}));
	}
);

export const isRefreshingAtom = atom(false);
