"use client";

import { useAtom } from "jotai";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
	insightsRangeAtom,
	TIME_RANGE_SHORT_LABELS,
	TIME_RANGES,
	type TimeRange,
} from "../lib/time-range";

const OPTIONS = TIME_RANGES.map((value) => ({
	value,
	label: TIME_RANGE_SHORT_LABELS[value],
}));

export function TimeRangeSelector() {
	const [range, setRange] = useAtom(insightsRangeAtom);

	return (
		<SegmentedControl<TimeRange>
			onValueChangeAction={setRange}
			options={OPTIONS}
			value={range}
		/>
	);
}
