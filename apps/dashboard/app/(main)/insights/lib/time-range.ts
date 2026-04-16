import { atomWithStorage } from "jotai/utils";

export type TimeRange = "7d" | "30d" | "90d";

export const TIME_RANGES: TimeRange[] = ["7d", "30d", "90d"];

export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
	"7d": "Last 7 days",
	"30d": "Last 30 days",
	"90d": "Last 90 days",
};

export const TIME_RANGE_SHORT_LABELS: Record<TimeRange, string> = {
	"7d": "7d",
	"30d": "30d",
	"90d": "90d",
};

export const insightsRangeAtom = atomWithStorage<TimeRange>(
	"insights.range",
	"7d"
);
