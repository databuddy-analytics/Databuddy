import { parseAsString, useQueryState } from "nuqs";
import { useCallback, useMemo } from "react";
import {
	getDefaultDateRangePresetSync,
	getDefaultDatesFromPreset,
} from "@/hooks/use-default-date-range";
import { dayjs } from "@databuddy/ui";

export interface DateRangeState {
	endDate: Date;
	startDate: Date;
}

export type TimeGranularity = "daily" | "hourly";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
	return DATE_ONLY_RE.test(value);
}

function toCalendarDate(value: string): string {
	return isDateOnly(value) ? value : dayjs(value).format("YYYY-MM-DD");
}

function formatRangeBound(date: Date, exact: boolean): string {
	return exact
		? dayjs(date).startOf("minute").toISOString()
		: dayjs(date).format("YYYY-MM-DD");
}

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
			startDate: toCalendarDate(startDateStr),
			endDate: toCalendarDate(endDateStr),
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

	const calendarDateRange = useMemo(
		() => ({
			start_date: toCalendarDate(startDateStr),
			end_date: toCalendarDate(endDateStr),
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
		(newRange: DateRangeState, options?: { exact?: boolean }) => {
			const exact = options?.exact ?? false;
			const startDate = formatRangeBound(newRange.startDate, exact);
			const endDate = formatRangeBound(newRange.endDate, exact);

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
		calendarDateRange,
		currentGranularity: granularity,
		setCurrentDateRange,
		setCurrentGranularityAtomState: setGranularityStr,
		setDateRangeAction,
	};
}
