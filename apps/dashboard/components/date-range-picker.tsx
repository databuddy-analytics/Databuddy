'use client';

import { CalendarDotsIcon } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
	className?: string;
	value?: DateRange;
	onChange?: (dateRange: DateRange | undefined) => void;
	disabled?: boolean;
	maxDate?: Date;
	minDate?: Date;
}

export function DateRangePicker({
	className,
	value,
	onChange,
	disabled = false,
	maxDate,
	minDate,
}: DateRangePickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [tempRange, setTempRange] = useState<DateRange | undefined>(value);
	const [appliedRange, setAppliedRange] = useState<DateRange | undefined>(
		value
	);

	useEffect(() => {
		setAppliedRange(value);
		setTempRange(value);
	}, [value]);

	const handleTempSelect = useCallback((range: DateRange | undefined) => {
		setTempRange(range);
	}, []);

	const handleApply = useCallback(() => {
		if (tempRange?.from && tempRange?.to) {
			setAppliedRange(tempRange);
			onChange?.(tempRange);
			setIsOpen(false);
		}
	}, [tempRange, onChange]);

	const handleCancel = useCallback(() => {
		setTempRange(appliedRange);
		setIsOpen(false);
	}, [appliedRange]);

	const handleClear = useCallback(() => {
		setTempRange(undefined);
		setAppliedRange(undefined);
		onChange?.(undefined);
		setIsOpen(false);
	}, [onChange]);

	const getDisplayText = useCallback(() => {
		if (!appliedRange?.from) {
			return 'Select dates';
		}

		if (appliedRange.from && !appliedRange.to) {
			return format(appliedRange.from, 'MMM d, yyyy');
		}

		if (appliedRange.from && appliedRange.to) {
			if (appliedRange.from.getTime() === appliedRange.to.getTime()) {
				return format(appliedRange.from, 'MMM d, yyyy');
			}

			if (appliedRange.from.getFullYear() !== appliedRange.to.getFullYear()) {
				return `${format(appliedRange.from, 'MMM d, yyyy')} - ${format(appliedRange.to, 'MMM d, yyyy')}`;
			}

			return `${format(appliedRange.from, 'MMM d')} - ${format(appliedRange.to, 'MMM d, yyyy')}`;
		}

		return 'Select dates';
	}, [appliedRange]);

	const hasSelection = appliedRange?.from && appliedRange?.to;
	const hasValidTempSelection = tempRange?.from && tempRange?.to;

	return (
		<div className={cn('grid gap-2', className)}>
			<Popover onOpenChange={setIsOpen} open={isOpen}>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							'h-8 justify-start gap-2 whitespace-nowrap border px-3 text-left font-normal text-sm shadow-xs transition-[color,box-shadow]',
							!hasSelection && 'text-muted-foreground'
						)}
						disabled={disabled}
						size="sm"
						variant="outline"
					>
						<CalendarDotsIcon className="h-4 w-4" weight="duotone" />
						<span className="truncate font-medium text-sm">
							{getDisplayText()}
						</span>
					</Button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					className="w-auto rounded border p-0 shadow-md"
				>
					<div className="border-b bg-muted/20 p-4">
						<div className="text-muted-foreground text-sm">
							{tempRange?.from && tempRange?.to ? (
								<span className="font-medium text-foreground">
									{format(tempRange.from, 'MMM d')} -{' '}
									{format(tempRange.to, 'MMM d, yyyy')}
								</span>
							) : tempRange?.from ? (
								<span>
									<span className="font-medium text-foreground">
										{format(tempRange.from, 'MMM d')}
									</span>
									<span className="text-muted-foreground">
										{' '}
										→ Select end date
									</span>
								</span>
							) : (
								<span className="font-medium">Select start date</span>
							)}
						</div>
					</div>

					<div className="p-4">
						<Calendar
							defaultMonth={tempRange?.from || appliedRange?.from || new Date()}
							disabled={(date) => {
								if (minDate && date < minDate) {
									return true;
								}
								if (maxDate && date > maxDate) {
									return true;
								}
								return false;
							}}
							initialFocus
							mode="range"
							numberOfMonths={2}
							onSelect={handleTempSelect}
							selected={tempRange}
						/>
					</div>

					<div className="flex items-center justify-between border-t bg-muted/20 p-4">
						<Button
							className="h-8 text-muted-foreground transition-[color,box-shadow] hover:text-foreground"
							onClick={handleClear}
							size="sm"
							variant="ghost"
						>
							Clear
						</Button>

						<div className="flex gap-2">
							<Button
								className="h-8 transition-[color,box-shadow]"
								onClick={handleCancel}
								size="sm"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button
								className="h-8 shadow-xs transition-[color,box-shadow]"
								disabled={!hasValidTempSelection}
								onClick={handleApply}
								size="sm"
							>
								Apply
							</Button>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
