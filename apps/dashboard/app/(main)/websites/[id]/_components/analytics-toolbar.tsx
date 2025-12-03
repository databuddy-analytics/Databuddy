"use client";

import { ArrowClockwiseIcon } from "@phosphor-icons/react";
import clsx from "clsx";
import dayjs from "dayjs";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import type { DateRange as DayPickerRange } from "react-day-picker";
import { useHotkeys } from "react-hotkeys-hook";
import { LiveUserIndicator } from "@/components/analytics";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { useDateFilters } from "@/hooks/use-date-filters";
import { addDynamicFilterAtom } from "@/stores/jotai/filterAtoms";
import { AddFilterForm } from "./filters/add-filters";
import { FiltersSection } from "./filters/filters-section";

const MAX_HOURLY_DAYS = 7;

type QuickRange = {
	label: string;
	fullLabel: string;
	hours?: number;
	days?: number;
};

const QUICK_RANGES: QuickRange[] = [
	{ label: "24h", fullLabel: "Last 24 hours", hours: 24 },
	{ label: "7d", fullLabel: "Last 7 days", days: 7 },
	{ label: "30d", fullLabel: "Last 30 days", days: 30 },
	{ label: "90d", fullLabel: "Last 90 days", days: 90 },
	{ label: "180d", fullLabel: "Last 180 days", days: 180 },
	{ label: "365d", fullLabel: "Last 365 days", days: 365 },
];

const getStartDateForRange = (range: QuickRange) => {
	const now = new Date();
	return range.hours
		? dayjs(now).subtract(range.hours, "hour").toDate()
		: dayjs(now)
				.subtract(range.days ?? 7, "day")
				.toDate();
};

type AnalyticsToolbarProps = {
	isDisabled?: boolean;
	isLoading?: boolean;
	isRefreshing: boolean;
	onRefreshAction: () => void;
	websiteId: string;
};

export function AnalyticsToolbar({
	isDisabled = false,
	isLoading = false,
	isRefreshing,
	onRefreshAction,
	websiteId,
}: AnalyticsToolbarProps) {
	const {
		currentDateRange,
		currentGranularity,
		setCurrentGranularityAtomState,
		setDateRangeAction,
	} = useDateFilters();

	const [, addFilter] = useAtom(addDynamicFilterAtom);

	const dateRangeDays = useMemo(
		() =>
			dayjs(currentDateRange.endDate).diff(currentDateRange.startDate, "day"),
		[currentDateRange]
	);

	const isHourlyDisabled = dateRangeDays > MAX_HOURLY_DAYS;

	const selectedRange: DayPickerRange | undefined = useMemo(
		() => ({
			from: currentDateRange.startDate,
			to: currentDateRange.endDate,
		}),
		[currentDateRange]
	);

	const handleQuickRangeSelect = useCallback(
		(range: QuickRange) => {
			const start = getStartDateForRange(range);
			setDateRangeAction({ startDate: start, endDate: new Date() });
		},
		[setDateRangeAction]
	);

	const getGranularityButtonClass = (type: "daily" | "hourly") => {
		const isActive = currentGranularity === type;
		const baseClass =
			"h-full w-24 cursor-pointer touch-manipulation rounded-none px-0 text-sm";
		const activeClass = isActive
			? "font-medium bg-accent hover:bg-accent! text-accent-foreground"
			: "text-muted-foreground";
		return `${baseClass} ${activeClass}`.trim();
	};

	const isQuickRangeActive = useCallback(
		(range: QuickRange) => {
			if (!(selectedRange?.from && selectedRange?.to)) {
				return false;
			}

			const now = new Date();
			const start = getStartDateForRange(range);

			return (
				dayjs(selectedRange.from).isSame(start, "day") &&
				dayjs(selectedRange.to).isSame(now, "day")
			);
		},
		[selectedRange]
	);

	useHotkeys(
		["1", "2", "3", "4", "5", "6"],
		(e) => {
			if (isDisabled) {
				return;
			}
			const index = Number.parseInt(e.key, 10) - 1;
			if (index >= 0 && index < QUICK_RANGES.length) {
				e.preventDefault();
				handleQuickRangeSelect(QUICK_RANGES[index]);
			}
		},
		{ preventDefault: true, enabled: !isDisabled },
		[isDisabled, handleQuickRangeSelect]
	);

	return (
		<div className="flex h-fit flex-col bg-background">
			<div className="flex h-12 items-center justify-between border-b pr-4">
				<div className="flex h-full items-center">
					<Button
						className={clsx(getGranularityButtonClass("daily"), "border-r")}
						disabled={isDisabled}
						onClick={() => setCurrentGranularityAtomState("daily")}
						title="View daily aggregated data"
						variant="ghost"
					>
						Daily
					</Button>
					<Button
						className={clsx(getGranularityButtonClass("hourly"), "border-r")}
						disabled={isHourlyDisabled || isDisabled}
						onClick={() => setCurrentGranularityAtomState("hourly")}
						title={
							isHourlyDisabled
								? `Hourly view is only available for ${MAX_HOURLY_DAYS} days or less`
								: `View hourly data (up to ${MAX_HOURLY_DAYS} days)`
						}
						variant="ghost"
					>
						Hourly
					</Button>
				</div>

				<div className="flex items-center gap-2">
					<AddFilterForm
						addFilter={addFilter}
						buttonText="Filter"
						className="h-8"
						disabled={isDisabled}
					/>
					{!isDisabled && <LiveUserIndicator websiteId={websiteId} />}
					<Button
						aria-label="Refresh data"
						className="size-8"
						disabled={isRefreshing || isDisabled}
						onClick={onRefreshAction}
						variant="secondary"
					>
						<ArrowClockwiseIcon
							aria-hidden="true"
							className={`size-4 ${isRefreshing || isLoading ? "animate-spin" : ""}`}
						/>
					</Button>
				</div>
			</div>

			<div className="flex h-10 items-center overflow-x-auto overflow-y-hidden border-b pr-4">
				{QUICK_RANGES.map((range) => {
					const isActive = isQuickRangeActive(range);
					return (
						<div className="flex h-full items-center" key={range.label}>
							<Button
								className={clsx(
									"h-10 w-12 cursor-pointer touch-manipulation whitespace-nowrap rounded-none border-r px-0 font-medium text-xs",
									isActive
										? "bg-accent text-accent-foreground hover:bg-accent"
										: "hover:bg-accent!"
								)}
								disabled={isDisabled}
								onClick={() => handleQuickRangeSelect(range)}
								title={range.fullLabel}
								variant={isActive ? "secondary" : "ghost"}
							>
								{range.label}
							</Button>
						</div>
					);
				})}

				<div className="flex h-full items-center pl-1">
					<DateRangePicker
						className="w-auto"
						disabled={isDisabled}
						maxDate={new Date()}
						minDate={new Date(2020, 0, 1)}
						onChange={(range) => {
							if (range?.from && range?.to) {
								setDateRangeAction({
									startDate: range.from,
									endDate: range.to,
								});
							}
						}}
						value={selectedRange}
					/>
				</div>
			</div>

			{!isDisabled && <FiltersSection />}
		</div>
	);
}
