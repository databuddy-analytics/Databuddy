'use client';

import { ArrowClockwiseIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { LiveUserIndicator } from '@/components/analytics';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { useDateFilters } from '@/hooks/use-date-filters';
import { addDynamicFilterAtom } from '@/stores/jotai/filterAtoms';
import { AddFilterForm } from './utils/add-filters';

const MAX_HOURLY_DAYS = 7;

type QuickRange = {
	label: string;
	fullLabel: string;
	hours?: number;
	days?: number;
};

const QUICK_RANGES: QuickRange[] = [
	{ label: '24h', fullLabel: 'Last 24 hours', hours: 24 },
	{ label: '7d', fullLabel: 'Last 7 days', days: 7 },
	{ label: '30d', fullLabel: 'Last 30 days', days: 30 },
	{ label: '90d', fullLabel: 'Last 90 days', days: 90 },
	{ label: '180d', fullLabel: 'Last 180 days', days: 180 },
	{ label: '365d', fullLabel: 'Last 365 days', days: 365 },
];

const getStartDateForRange = (range: QuickRange) => {
	const now = new Date();
	return range.hours
		? dayjs(now).subtract(range.hours, 'hour').toDate()
		: dayjs(now).subtract(range.days ?? 7, 'day').toDate();
};

interface AnalyticsToolbarProps {
	isRefreshing: boolean;
	onRefresh: () => void;
	websiteId: string;
}

export function AnalyticsToolbar({
	isRefreshing,
	onRefresh,
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
			dayjs(currentDateRange.endDate).diff(
				currentDateRange.startDate,
				'day'
			),
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

	const getGranularityButtonClass = (type: 'daily' | 'hourly') => {
		const isActive = currentGranularity === type;
		const baseClass =
			'h-full w-24 cursor-pointer touch-manipulation rounded-none px-0 text-sm';
		const activeClass = isActive
			? 'bg-primary/10 font-medium text-primary'
			: 'text-muted-foreground';
		const disabledClass =
			type === 'hourly' && isHourlyDisabled
				? 'cursor-not-allowed opacity-50'
				: '';
		return `${baseClass} ${activeClass} ${disabledClass}`.trim();
	};

	const isQuickRangeActive = useCallback(
		(range: QuickRange) => {
			if (!selectedRange?.from || !selectedRange?.to) return false;

			const now = new Date();
			const start = getStartDateForRange(range);

			return (
				dayjs(selectedRange.from).isSame(start, 'day') &&
				dayjs(selectedRange.to).isSame(now, 'day')
			);
		},
		[selectedRange]
	);

	return (
		<div className="flex h-22 flex-col border-b bg-card">
			<div className="flex h-12 items-center justify-between border-b border-border pr-4">
				<div className="flex h-full items-center">
					<Button
						className={getGranularityButtonClass('daily')}
						onClick={() => setCurrentGranularityAtomState('daily')}
						title="View daily aggregated data"
						variant="ghost"
					>
						Daily
					</Button>
					<div className="h-full w-px bg-border/50" />
					<Button
						className={getGranularityButtonClass('hourly')}
						disabled={isHourlyDisabled}
						onClick={() => setCurrentGranularityAtomState('hourly')}
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
					<AddFilterForm addFilter={addFilter} buttonText="Filter" className="h-8" />
					<LiveUserIndicator websiteId={websiteId} />
					<Button
						aria-label="Refresh data"
						className="h-8 w-8"
						disabled={isRefreshing}
						onClick={onRefresh}
						variant="outline"
					>
						<ArrowClockwiseIcon
							aria-hidden="true"
							className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
						/>
					</Button>
				</div>
			</div>

			<div className="flex h-10 items-center overflow-x-auto pr-4">
				{QUICK_RANGES.map((range, index) => {
					const isActive = isQuickRangeActive(range);
					return (
						<div className="flex h-full items-center" key={range.label}>
							{index > 0 && <div className="h-full w-px bg-border/50" />}
							<Button
								className={`h-full w-12 cursor-pointer rounded-none touch-manipulation whitespace-nowrap px-0 font-medium text-xs ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
								onClick={() => handleQuickRangeSelect(range)}
								title={range.fullLabel}
								variant={isActive ? 'secondary' : 'ghost'}
							>
								{range.label}
							</Button>
						</div>
					);
				})}

				<div className="border-border/50 border-l pl-2">
					<DateRangePicker
						className="w-auto"
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
		</div>
	);
}
