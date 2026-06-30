import type { DateRange } from "@/types/analytics";
import { dayjs } from "@databuddy/ui";

export function formatDateLabel(
	dateStr: string,
	granularity: "hourly" | "daily"
): string {
	const date = dayjs(dateStr);
	if (granularity === "hourly") {
		return date.format("MMM D HH:mm");
	}
	return date.format("MMM D");
}

export function getGranularity(dateRange: DateRange): "hourly" | "daily" {
	return dateRange.granularity ?? "daily";
}

export function generateDateRange(
	startDate: string,
	endDate: string,
	granularity: "daily" | "hourly"
): string[] {
	const dates: string[] = [];
	let current = dayjs(startDate);
	const end = dayjs(endDate);
	const unit = granularity === "hourly" ? "hour" : "day";
	const format =
		granularity === "hourly" ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD";

	while (current.isBefore(end) || current.isSame(end, "day")) {
		dates.push(current.format(format));
		current = current.add(1, unit);
	}

	return dates;
}

export function normalizeDateKey(
	date: string,
	granularity: "hourly" | "daily"
): string {
	return granularity === "hourly" ? date : date.slice(0, 10);
}

export function safePercentage(value: number | null | undefined): number {
	return value == null || Number.isNaN(value) ? 0 : value;
}
