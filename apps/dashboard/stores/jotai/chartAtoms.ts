import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface MetricVisibilityState {
	pageviews: boolean;
	visitors: boolean;
	sessions: boolean;
	bounce_rate: boolean;
	median_session_duration: boolean;
	revenue: boolean;
	refunds: boolean;
}

const defaultVisibleMetrics: MetricVisibilityState = {
	pageviews: true,
	visitors: true,
	sessions: false,
	bounce_rate: false,
	median_session_duration: false,
	revenue: true,
	refunds: false,
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
	revenue: boolean;
	transactions: boolean;
	avg_transaction: boolean;
	customers: boolean;
	refunds: boolean;
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
