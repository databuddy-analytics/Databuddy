import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import {
	getDefaultDateRangePresetSync,
	getDefaultDatesFromPreset,
} from "@/hooks/use-default-date-range";
import dayjs from "@/lib/dayjs";
import type {
	DateRangeState,
	TimeGranularity,
} from "@/stores/jotai/filterAtoms";

const MAX_HOURLY_DAYS = 7;
const AUTO_HOURLY_DAYS = 2;

export function useDateFilters() {
	const defaultPreset = getDefaultDateRangePresetSync();
	const { startDate: defaultStartDate, endDate: defaultEndDate } =
		getDefaultDatesFromPreset(defaultPreset);

	const [startDateStr, setStartDateStr] = useQueryState(
		"startDate",
		parseAsString.withDefault(defaultStartDate)
	);
	const [endDateStr, setEndDateStr] = useQueryState(
		"endDate",
		parseAsString.withDefault(defaultEndDate)
	);
	const [granularityStr, setGranularityStr] = useQueryState(
		"granularity",
		parseAsString.withDefault("daily")
	);

	const granularity: TimeGranularity =
		granularityStr === "daily" || granularityStr === "hourly"
			? granularityStr
			: "daily";

	const getAutoGranularity = useCallback(
		(startDate: string, endDate: string): TimeGranularity => {
			const rangeDays = dayjs(endDate).diff(dayjs(startDate), "day");
			if (rangeDays > MAX_HOURLY_DAYS) {
				return "daily";
			}
			if (rangeDays <= AUTO_HOURLY_DAYS) {
				return "hourly";
			}
			return granularity;
		},
		[granularity]
	);

	const currentDateRange = useMemo<DateRangeState>(
		() => ({
			startDate: dayjs(startDateStr).toDate(),
			endDate: dayjs(endDateStr).toDate(),
		}),
		[startDateStr, endDateStr]
	);

	const formattedDateRangeState = useMemo(
		() => ({
			startDate: startDateStr,
			endDate: endDateStr,
		}),
		[startDateStr, endDateStr]
	);

	const dateRange = useMemo(
		() => ({
			start_date: startDateStr,
			end_date: endDateStr,
			granularity,
		}),
		[startDateStr, endDateStr, granularity]
	);

	const setCurrentDateRange = useCallback(
		(range: DateRangeState) => {
			setStartDateStr(dayjs(range.startDate).format("YYYY-MM-DD"));
			setEndDateStr(dayjs(range.endDate).format("YYYY-MM-DD"));
		},
		[setStartDateStr, setEndDateStr]
	);

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
		currentDateRange,
		formattedDateRangeState,
		dateRange,
		currentGranularity: granularity,
		setCurrentDateRange,
		setCurrentGranularityAtomState: setGranularityStr,
		setDateRangeAction,
	};
}
