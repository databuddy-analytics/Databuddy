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
