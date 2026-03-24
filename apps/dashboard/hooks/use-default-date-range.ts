import { usePersistentState } from "@/hooks/use-persistent-state";
import dayjs from "@/lib/dayjs";

const DEFAULT_DATE_RANGE_STORAGE_KEY = "databuddy-default-date-range";

export const DEFAULT_DATE_RANGE_PRESETS = [
	"24h",
	"7d",
	"30d",
	"90d",
	"180d",
	"365d",
] as const;

export type DefaultDateRangePreset =
	(typeof DEFAULT_DATE_RANGE_PRESETS)[number];

function isValidPreset(value: unknown): value is DefaultDateRangePreset {
	return (
		typeof value === "string" &&
		DEFAULT_DATE_RANGE_PRESETS.includes(value as DefaultDateRangePreset)
	);
}

/**
 * Reads the default date range preset from localStorage synchronously.
 * Used by use-date-filters for the initial default when URL has no params.
 * Returns "30d" during SSR or when storage is unavailable.
 */
export function getDefaultDateRangePresetSync(): DefaultDateRangePreset {
	if (typeof window === "undefined") {
		return "30d";
	}
	try {
		const stored = window.localStorage.getItem(DEFAULT_DATE_RANGE_STORAGE_KEY);
		const parsed = stored ? (JSON.parse(stored) as unknown) : null;
		return isValidPreset(parsed) ? parsed : "30d";
	} catch {
		return "30d";
	}
}

export function getDefaultDatesFromPreset(preset: DefaultDateRangePreset): {
	startDate: string;
	endDate: string;
} {
	if (preset === "24h") {
		return {
			endDate: dayjs().format("YYYY-MM-DD"),
			startDate: dayjs().subtract(24, "hour").format("YYYY-MM-DD"),
		};
	}
	const daysMap: Record<Exclude<DefaultDateRangePreset, "24h">, number> = {
		"7d": 7,
		"30d": 30,
		"90d": 90,
		"180d": 180,
		"365d": 365,
	};
	const days = daysMap[preset];
	return {
		endDate: dayjs().format("YYYY-MM-DD"),
		startDate: dayjs().subtract(days, "day").format("YYYY-MM-DD"),
	};
}

export function getPresetLabel(preset: DefaultDateRangePreset): string {
	const labels: Record<DefaultDateRangePreset, string> = {
		"24h": "24 hours",
		"7d": "7 days",
		"30d": "30 days",
		"90d": "90 days",
		"180d": "180 days",
		"365d": "365 days",
	};
	return labels[preset];
}

export function useDefaultDateRange() {
	const [stored, setStored] = usePersistentState<DefaultDateRangePreset>(
		DEFAULT_DATE_RANGE_STORAGE_KEY,
		"30d"
	);

	const preset = isValidPreset(stored) ? stored : "30d";

	return { defaultDateRange: preset, setDefaultDateRange: setStored };
}
