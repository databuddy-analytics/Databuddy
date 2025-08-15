import { useAtom } from 'jotai';
import { useMemo } from 'react';
import {
	dateRangeAtom,
	formattedDateRangeAtom,
	setDateRangeAndAdjustGranularityAtom,
	timeGranularityAtom,
	timezoneAtom,
} from '@/stores/jotai/filterAtoms';

export function useDateFilters() {
	const [currentDateRange, setCurrentDateRange] = useAtom(dateRangeAtom);
	const [timezone] = useAtom(timezoneAtom);
	const [formattedDateRangeState] = useAtom(formattedDateRangeAtom);
	const [currentGranularity, setCurrentGranularityAtomState] =
		useAtom(timeGranularityAtom);
	const [, setDateRangeAction] = useAtom(setDateRangeAndAdjustGranularityAtom);

	const dateRange = useMemo(
		() => ({
			start_date: formattedDateRangeState.startDate,
			end_date: formattedDateRangeState.endDate,
			granularity: currentGranularity,
			timezone,
		}),
		[formattedDateRangeState, currentGranularity, timezone]
	);

	return {
		currentDateRange,
		setCurrentDateRange,
		formattedDateRangeState,
		currentGranularity,
		setCurrentGranularityAtomState,
		dateRange,
		setDateRangeAction,
	};
}
