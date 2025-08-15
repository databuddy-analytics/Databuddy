'use client';

import { type DynamicQueryFilter, filterOptions } from '@databuddy/shared';
import { ArrowClockwiseIcon, XIcon } from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { operatorOptions, useFilters } from '@/hooks/use-filters';
import {
	dateRangeAtom,
	setDateRangeAndAdjustGranularityAtom,
	timeGranularityAtom,
} from '@/stores/jotai/filterAtoms';
import { AddFilterForm, getOperatorShorthand } from './utils/add-filters';

interface AnalyticsToolbarProps {
	isRefreshing: boolean;
	onRefresh: () => void;
	selectedFilters: DynamicQueryFilter[];
	onFiltersChange: (filters: DynamicQueryFilter[]) => void;
}

export function AnalyticsToolbar({
	isRefreshing,
	onRefresh,
	selectedFilters,
	onFiltersChange,
}: AnalyticsToolbarProps) {
	const [currentDateRange] = useAtom(dateRangeAtom);
	const [currentGranularity, setCurrentGranularityAtomState] =
		useAtom(timeGranularityAtom);
	const [, setDateRangeAction] = useAtom(setDateRangeAndAdjustGranularityAtom);

	const { addFilter, removeFilter } = useFilters({
		filters: selectedFilters,
		onFiltersChange,
	});

	const dayPickerSelectedRange: DayPickerRange | undefined = useMemo(
		() => ({
			from: currentDateRange.startDate,
			to: currentDateRange.endDate,
		}),
		[currentDateRange]
	);

	const quickRanges = useMemo(
		() => [
			{ label: '24h', fullLabel: 'Last 24 hours', hours: 24 },
			{ label: '7d', fullLabel: 'Last 7 days', days: 7 },
			{ label: '30d', fullLabel: 'Last 30 days', days: 30 },
			{ label: '90d', fullLabel: 'Last 90 days', days: 90 },
			{ label: '180d', fullLabel: 'Last 180 days', days: 180 },
			{ label: '365d', fullLabel: 'Last 365 days', days: 365 },
		],
		[]
	);

	const handleQuickRangeSelect = useCallback(
		(range: (typeof quickRanges)[0]) => {
			const now = new Date();
			const start = range.hours
				? dayjs(now).subtract(range.hours, 'hour').toDate()
				: dayjs(now)
						.subtract(range.days || 7, 'day')
						.toDate();
			setDateRangeAction({ startDate: start, endDate: now });
		},
		[setDateRangeAction]
	);

	return (
		<>
			<div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/30 p-2.5">
				<div className="flex items-center justify-between gap-3">
					<div className="flex h-8 overflow-hidden rounded-md border bg-background shadow-sm">
						<Button
							className={`h-8 cursor-pointer touch-manipulation rounded-none px-2 text-xs sm:px-3 ${currentGranularity === 'daily' ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}
							onClick={() => setCurrentGranularityAtomState('daily')}
							size="sm"
							title="View daily aggregated data"
							variant="ghost"
						>
							Daily
						</Button>
						<Button
							className={`h-8 cursor-pointer touch-manipulation rounded-none px-2 text-xs sm:px-3 ${currentGranularity === 'hourly' ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}
							onClick={() => setCurrentGranularityAtomState('hourly')}
							size="sm"
							title="View hourly data (best for 24h periods)"
							variant="ghost"
						>
							Hourly
						</Button>
					</div>

					<Button
						aria-label="Refresh data"
						className="h-8 w-8"
						disabled={isRefreshing}
						onClick={onRefresh}
						size="icon"
						variant="outline"
					>
						<ArrowClockwiseIcon
							aria-hidden="true"
							className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
						/>
					</Button>
				</div>

				<div className="flex items-center gap-2 overflow-x-auto rounded-md border bg-background p-1 shadow-sm">
					{quickRanges.map((range) => {
						const now = new Date();
						const start = range.hours
							? dayjs(now).subtract(range.hours, 'hour').toDate()
							: dayjs(now)
									.subtract(range.days || 7, 'day')
									.toDate();
						const dayPickerCurrentRange = dayPickerSelectedRange;
						const isActive =
							dayPickerCurrentRange?.from &&
							dayPickerCurrentRange?.to &&
							dayjs(dayPickerCurrentRange.from).format('YYYY-MM-DD') ===
								dayjs(start).format('YYYY-MM-DD') &&
							dayjs(dayPickerCurrentRange.to).format('YYYY-MM-DD') ===
								dayjs(now).format('YYYY-MM-DD');

						return (
							<Button
								className={`h-6 cursor-pointer touch-manipulation whitespace-nowrap px-2 text-xs sm:px-2.5 ${isActive ? 'shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
								key={range.label}
								onClick={() => handleQuickRangeSelect(range)}
								size="sm"
								title={range.fullLabel}
								variant={isActive ? 'default' : 'ghost'}
							>
								<span className="sm:hidden">{range.label}</span>
								<span className="hidden sm:inline">{range.fullLabel}</span>
							</Button>
						);
					})}

					<div className="ml-1 border-border/50 border-l pl-2 sm:pl-3">
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
							value={dayPickerSelectedRange}
						/>
					</div>

					<div className="ml-2 flex items-center">
						<AddFilterForm addFilter={addFilter} />
					</div>
				</div>
			</div>

			{selectedFilters.length > 0 && (
				<div className="mt-3 rounded-lg border bg-muted/30 p-2.5">
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2 overflow-x-auto">
							<div className="font-semibold text-sm">Filters</div>
							<div className="flex flex-wrap items-center gap-2">
								{selectedFilters.map((filter, index) => {
									const fieldLabel = filterOptions.find(
										(o) => o.value === filter.field
									)?.label;
									const operatorLabel = operatorOptions.find(
										(o) => getOperatorShorthand(o.value) === filter.operator
									)?.label;
									const valueLabel = Array.isArray(filter.value)
										? filter.value.join(', ')
										: filter.value;

									return (
										<div
											className="flex items-center gap-0 rounded border bg-background py-1 pr-2 pl-3 shadow-sm"
											key={`filter-${index}-${filter.field}-${filter.operator}`}
										>
											<div className="flex items-center gap-1">
												<span className="font-medium text-foreground text-sm">
													{fieldLabel}
												</span>
												<span className="text-muted-foreground/70 text-sm">
													{operatorLabel}
												</span>
												<span className="font-medium text-foreground text-sm">
													{valueLabel}
												</span>
											</div>
											<button
												aria-label={`Remove filter ${fieldLabel} ${operatorLabel} ${valueLabel}`}
												className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted/50"
												onClick={() => removeFilter(index)}
												type="button"
											>
												<XIcon aria-hidden="true" className="h-3 w-3" />
											</button>
										</div>
									);
								})}
							</div>
						</div>

						<Button onClick={() => onFiltersChange([])} variant="outline">
							Clear all filters
						</Button>
					</div>
				</div>
			)}
		</>
	);
}
