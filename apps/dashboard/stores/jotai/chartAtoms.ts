import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// --- Metric Visibility State ---
export interface MetricVisibilityState {
	pageviews: boolean;
	visitors: boolean;
	sessions: boolean;
	bounce_rate: boolean;
	avg_session_duration: boolean;
}

// Default visible metrics
const defaultVisibleMetrics: MetricVisibilityState = {
	pageviews: true,
	visitors: true,
	sessions: false,
	bounce_rate: false,
	avg_session_duration: false,
};

// Persistent atom for metric visibility
export const metricVisibilityAtom = atomWithStorage<MetricVisibilityState>(
	'databuddy-metric-visibility',
	defaultVisibleMetrics
);

// Action atom to toggle a specific metric
export const toggleMetricAtom = atom(
	null,
	(_get: any, set: any, metric: keyof MetricVisibilityState) => {
		set(metricVisibilityAtom, (prev: MetricVisibilityState) => ({
			...prev,
			[metric]: !prev[metric],
		}));
	}
);

// Action atom to set all metrics visibility at once
export const setMetricVisibilityAtom = atom(
	null,
	(_get: any, set: any, visibility: Partial<MetricVisibilityState>) => {
		set(metricVisibilityAtom, (prev: MetricVisibilityState) => ({
			...prev,
			...visibility,
		}));
	}
);

// Action atom to reset to default visibility
export const resetMetricVisibilityAtom = atom(null, (_get: any, set: any) => {
	set(metricVisibilityAtom, defaultVisibleMetrics);
});

// Derived atom to get only visible metrics
export const visibleMetricsAtom = atom((get: any) => {
	const visibility = get(metricVisibilityAtom);
	return Object.entries(visibility)
		.filter(([, isVisible]) => isVisible)
		.map(([metric]) => metric);
});

// Derived atom to check if a specific metric is visible
export const isMetricVisibleAtom = (metric: keyof MetricVisibilityState) =>
	atom((get: any) => get(metricVisibilityAtom)[metric]);
