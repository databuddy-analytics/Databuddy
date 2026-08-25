import { dayjs } from "@databuddy/ui";

export function clampBounceRate(value: number | null | undefined): number {
	if (value == null || Number.isNaN(value)) {
		return 0;
	}
	return Math.max(0, Math.min(100, value));
}

type Granularity = "daily" | "hourly";

export const formatDateByGranularity = (
	date: string | Date,
	granularity: Granularity = "daily"
): string => {
	const dateObj = dayjs(date);
	return granularity === "hourly"
		? dateObj.format("MMM D, h:mm A")
		: dateObj.format("MMM D");
};

export const calculatePercentChange = (
	current: number,
	previous: number
): number => {
	if (previous === 0) {
		return current > 0 ? 100 : 0;
	}
	return ((current - previous) / previous) * 100;
};

export const PERFORMANCE_THRESHOLDS = {
	load_time: { good: 1500, average: 3000, unit: "ms" },
	ttfb: { good: 500, average: 1000, unit: "ms" },
	dom_ready: { good: 1000, average: 2000, unit: "ms" },
	render_time: { good: 1000, average: 2000, unit: "ms" },
	fcp: { good: 1800, average: 3000, unit: "ms" },
	lcp: { good: 2500, average: 4000, unit: "ms" },
	cls: { good: 0.1, average: 0.25, unit: "" },
};
