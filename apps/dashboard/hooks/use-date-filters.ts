import dayjs from"dayjs";
import { parseAsString, useQueryState } from"nuqs";
import { useCallback, useMemo } from"react";
import type {
	DateRangeState,
	TimeGranularity,
} from"@/stores/jotai/filterAtoms";

const MAX_HOURLY_DAYS = 7;
const AUTO_HOURLY_DAYS = 2;

const initialStartDate = dayjs().subtract(30,"day").format("YYYY-MM-DD");
const initialEndDate = dayjs().format("YYYY-MM-DD");

export function useDateFilters() {
	const [startDateStr, setStartDateStr] = useQueryState(
		"startDate",
		parseAsString.withDefault(initialStartDate)
	);
	const [endDateStr, setEndDateStr] = useQueryState(
		"endDate",
		parseAsString.withDefault(initialEndDate)
	);
	const [granularityStr, setGranularityStr] = useQueryState(
		"granularity",
		parseAsString.withDefault("daily")
	);

	// Validate granularity
	const granularity: TimeGranularity =
		granularityStr ==="daily" || granularityStr ==="hourly"
			? granularityStr
			:"daily";

	// Helper to auto-adjust granularity based on date range
	const getAutoGranularity = useCallback(
		(startDate: string, endDate: string): TimeGranularity => {
			const rangeDays = dayjs(endDate).diff(dayjs(startDate),"day");
			if (rangeDays > MAX_HOURLY_DAYS) {
				return"daily";
			}
			if (rangeDays <= AUTO_HOURLY_DAYS) {
				return"hourly";
			}
			return granularity;
		},
		[granularity]
	);

	// Date range as Date objects (for backward compatibility)
	const currentDateRange = useMemo<DateRangeState>(
		() => ({
			startDate: dayjs(startDateStr).toDate(),
			endDate: dayjs(endDateStr).toDate(),
		}),
		[startDateStr, endDateStr]
	);

	// Date range as formatted strings
	const formattedDateRangeState = useMemo(
		() => ({
			startDate: startDateStr,
			endDate: endDateStr,
		}),
		[startDateStr, endDateStr]
	);

	// Date range with granularity (for API calls)
	const dateRange = useMemo(
		() => ({
			start_date: startDateStr,
			end_date: endDateStr,
			granularity,
		}),
		[startDateStr, endDateStr, granularity]
	);

	// Update date range from Date objects
	const setCurrentDateRange = useCallback(
		(range: DateRangeState) => {
			setStartDateStr(dayjs(range.startDate).format("YYYY-MM-DD"));
			setEndDateStr(dayjs(range.endDate).format("YYYY-MM-DD"));
		},
		[setStartDateStr, setEndDateStr]
	);

	// Update date range with auto-adjust granularity
	const setDateRangeAction = useCallback(
		(newRange: DateRangeState) => {
			const startDate = dayjs(newRange.startDate).format("YYYY-MM-DD");
			const endDate = dayjs(newRange.endDate).format("YYYY-MM-DD");

			setStartDateStr(startDate);
			setEndDateStr(endDate);

			const newGranularity = getAutoGranularity(startDate, endDate);
			if (newGranularity !== granularity) {
				setGranularityStr(newGranularity);
			}
		},
		[
			setStartDateStr,
			setEndDateStr,
			getAutoGranularity,
			granularity,
			setGranularityStr,
		]
	);

	return {
		// Date range states
		currentDateRange,
		formattedDateRangeState,
		dateRange,

		// Granularity state
		currentGranularity: granularity,

		// Setters
		setCurrentDateRange,
		setCurrentGranularityAtomState: setGranularityStr,
		setDateRangeAction,
	};
}
