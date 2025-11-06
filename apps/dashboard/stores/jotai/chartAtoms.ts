import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

export interface MetricVisibilityState {
	pageviews: boolean;
	visitors: boolean;
	sessions: boolean;
	bounce_rate: boolean;
	avg_session_duration: boolean;
}

const defaultVisibleMetrics: MetricVisibilityState = {
	pageviews: true,
	visitors: true,
	sessions: false,
	bounce_rate: false,
	avg_session_duration: false,
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

export const isRefreshingAtom = atom(false);
