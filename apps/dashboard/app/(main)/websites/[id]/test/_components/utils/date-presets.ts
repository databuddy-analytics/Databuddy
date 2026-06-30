import type { DateRange } from "@/types/analytics";
import { dayjs } from "@databuddy/ui";
import type { DateRangePreset } from "./types";

export const DATE_RANGE_PRESETS: {
	value: DateRangePreset;
	label: string;
}[] = [
	{ value: "global", label: "Use global date range" },
	{ value: "today", label: "Today" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "last_7_days", label: "Last 7 days" },
	{ value: "last_14_days", label: "Last 14 days" },
	{ value: "last_30_days", label: "Last 30 days" },
	{ value: "this_month", label: "This month" },
	{ value: "last_month", label: "Last month" },
	{ value: "last_90_days", label: "Last 90 days" },
];

export function resolveDateRange(
	preset: DateRangePreset,
	globalDateRange: DateRange
): DateRange {
	if (preset === "global") {
		return globalDateRange;
	}

	const format = "YYYY-MM-DD";
	const today = dayjs();

	switch (preset) {
		case "today":
			return {
				...globalDateRange,
				start_date: today.format(format),
				end_date: today.format(format),
			};
		case "yesterday": {
			const yesterday = today.subtract(1, "day");
			return {
				...globalDateRange,
				start_date: yesterday.format(format),
				end_date: yesterday.format(format),
			};
		}
		case "last_7_days":
			return {
				...globalDateRange,
				start_date: today.subtract(6, "day").format(format),
				end_date: today.format(format),
			};
		case "last_14_days":
			return {
				...globalDateRange,
				start_date: today.subtract(13, "day").format(format),
				end_date: today.format(format),
			};
		case "last_30_days":
			return {
				...globalDateRange,
				start_date: today.subtract(29, "day").format(format),
				end_date: today.format(format),
			};
		case "this_month":
			return {
				...globalDateRange,
				start_date: today.startOf("month").format(format),
				end_date: today.format(format),
			};
		case "last_month":
			return {
				...globalDateRange,
				start_date: today.subtract(1, "month").startOf("month").format(format),
				end_date: today.subtract(1, "month").endOf("month").format(format),
			};
		case "last_90_days":
			return {
				...globalDateRange,
				start_date: today.subtract(89, "day").format(format),
				end_date: today.format(format),
			};
		default:
			return globalDateRange;
	}
}

export function getPresetLabel(preset: DateRangePreset): string {
	return DATE_RANGE_PRESETS.find((p) => p.value === preset)?.label || "Global";
}
