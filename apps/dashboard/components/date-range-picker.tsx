"use client";

import {
	CalendarDotsIcon,
	CaretRightIcon,
	CheckIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { formatMonthDay } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type PresetRange = {
	label: string;
	getValue: () => DateRange;
};

const PRESET_RANGES: PresetRange[] = [
	{
		label: "Today",
		getValue: () => {
			const today = dayjs().startOf("day").toDate();
			return { from: today, to: today };
		},
	},
	{
		label: "Yesterday",
		getValue: () => {
			const yesterday = dayjs().subtract(1, "day").startOf("day").toDate();
			return { from: yesterday, to: yesterday };
		},
	},
	{
		label: "Last 7 days",
		getValue: () => ({
			from: dayjs().subtract(6, "day").startOf("day").toDate(),
			to: dayjs().endOf("day").toDate(),
		}),
	},
	{
		label: "Last 14 days",
		getValue: () => ({
			from: dayjs().subtract(13, "day").startOf("day").toDate(),
			to: dayjs().endOf("day").toDate(),
		}),
	},
	{
		label: "Last 30 days",
		getValue: () => ({
			from: dayjs().subtract(29, "day").startOf("day").toDate(),
			to: dayjs().endOf("day").toDate(),
		}),
	},
	{
		label: "This month",
		getValue: () => ({
			from: dayjs().startOf("month").toDate(),
			to: dayjs().endOf("day").toDate(),
		}),
	},
	{
		label: "Last month",
		getValue: () => ({
			from: dayjs().subtract(1, "month").startOf("month").toDate(),
			to: dayjs().subtract(1, "month").endOf("month").toDate(),
		}),
	},
	{
		label: "Last 90 days",
		getValue: () => ({
			from: dayjs().subtract(89, "day").startOf("day").toDate(),
			to: dayjs().endOf("day").toDate(),
		}),
	},
];

type DateRangePickerProps = {
	className?: string;
	value?: DateRange;
	onChange?: (dateRange: DateRange | undefined) => void;
	disabled?: boolean;
	maxDate?: Date;
	minDate?: Date;
};

export function DateRangePicker({
	className,
	value,
	onChange,
	disabled = false,
	maxDate,
	minDate,
}: DateRangePickerProps) {
	const isMobile = useIsMobile();
	const [isOpen, setIsOpen] = useState(false);
	const [tempRange, setTempRange] = useState<DateRange | undefined>(value);

	useEffect(() => {
		if (!isOpen) {
			setTempRange(value);
		}
	}, [value, isOpen]);

	const daysDiff = useMemo(() => {
		if (!(tempRange?.from && tempRange?.to)) return 0;
		return dayjs(tempRange.to).diff(dayjs(tempRange.from), "day") + 1;
	}, [tempRange]);

	const activePreset = useMemo(() => {
		if (!(tempRange?.from && tempRange?.to)) return null;
		return PRESET_RANGES.find((preset) => {
			const presetRange = preset.getValue();
			return (
				dayjs(tempRange.from).isSame(presetRange.from, "day") &&
				dayjs(tempRange.to).isSame(presetRange.to, "day")
			);
		});
	}, [tempRange]);

	const handlePresetSelect = useCallback(
		(preset: PresetRange) => {
			const range = preset.getValue();
			setTempRange(range);
			onChange?.(range);
			setIsOpen(false);
		},
		[onChange]
	);

	const handleCalendarSelect = useCallback((range: DateRange | undefined) => {
		setTempRange(range);
	}, []);

	const handleApply = useCallback(() => {
		if (tempRange?.from && tempRange?.to) {
			onChange?.(tempRange);
			setIsOpen(false);
		}
	}, [tempRange, onChange]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			setIsOpen(open);
			if (!open) {
				setTempRange(value);
			}
		},
		[value]
	);

	const formatDisplayRange = useCallback((range: DateRange | undefined) => {
		if (!(range?.from && range?.to)) return "Select dates";

		const from = dayjs(range.from);
		const to = dayjs(range.to);
		const currentYear = dayjs().year();

		if (from.isSame(to, "day")) {
			return from.year() === currentYear
				? from.format("MMM D")
				: from.format("MMM D, YYYY");
		}

		const sameYear = from.year() === to.year();
		const isCurrentYear = from.year() === currentYear;

		if (sameYear && isCurrentYear) {
			return `${from.format("MMM D")} – ${to.format("MMM D")}`;
		}

		if (sameYear) {
			return `${from.format("MMM D")} – ${to.format("MMM D, YYYY")}`;
		}

		return `${from.format("MMM D, YYYY")} – ${to.format("MMM D, YYYY")}`;
	}, []);

	const hasValidSelection = tempRange?.from && tempRange?.to;

	return (
		<div className={cn("grid gap-2", className)}>
			<Popover onOpenChange={handleOpenChange} open={isOpen}>
				<PopoverTrigger asChild>
					<Button
						className={cn(
							"h-8 justify-start gap-2 whitespace-nowrap px-3 text-left font-medium text-xs",
							!value?.from && "text-muted-foreground"
						)}
						disabled={disabled}
						variant="secondary"
					>
						<CalendarDotsIcon className="size-4" weight="duotone" />
						<span className="truncate">{formatDisplayRange(value)}</span>
					</Button>
				</PopoverTrigger>

				<PopoverContent
					align="end"
					className="w-auto overflow-hidden p-0"
					sideOffset={4}
				>
					<div className="flex">
						{/* Presets sidebar */}
						<div className="hidden w-40 shrink-0 border-r bg-background sm:block">
							<div className="p-2">
								<p className="px-2 py-1.5 font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
									Quick select
								</p>
								<div className="space-y-0.5">
									{PRESET_RANGES.map((preset) => {
										const isActive = activePreset?.label === preset.label;
										return (
											<button
												className={cn(
													"flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm",
													isActive
														? "bg-primary text-primary-foreground"
														: "text-muted-foreground hover:bg-secondary hover:text-foreground"
												)}
												key={preset.label}
												onClick={() => handlePresetSelect(preset)}
												type="button"
											>
												<span>{preset.label}</span>
												{isActive && <CheckIcon className="size-3.5" />}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						{/* Calendar section */}
						<div className="flex flex-col">
							{/* Header showing selection */}
							<div className="flex items-center justify-between border-b bg-secondary px-4 py-3">
								<div className="flex items-center gap-2">
									{tempRange?.from ? (
										<>
											<div className="rounded bg-background px-2.5 py-1 shadow-sm">
												<span className="font-semibold text-foreground text-sm tabular-nums">
													{formatMonthDay(tempRange.from)}
												</span>
											</div>
											<CaretRightIcon
												className="size-3.5 text-muted-foreground"
												weight="bold"
											/>
											<div
												className={cn(
													"rounded px-2.5 py-1",
													tempRange?.to
														? "bg-background shadow-sm"
														: "border border-muted-foreground/40 border-dashed"
												)}
											>
												<span
													className={cn(
														"font-semibold text-sm tabular-nums",
														tempRange?.to
															? "text-foreground"
															: "text-muted-foreground"
													)}
												>
													{tempRange?.to
														? formatMonthDay(tempRange.to)
														: "End date"}
												</span>
											</div>
										</>
									) : (
										<span className="text-muted-foreground text-sm">
											Select a date range
										</span>
									)}
								</div>
								{daysDiff > 0 && (
									<span className="rounded-full bg-primary/15 px-2 py-0.5 font-semibold text-primary text-xs tabular-nums">
										{daysDiff} day{daysDiff !== 1 ? "s" : ""}
									</span>
								)}
							</div>

							{/* Mobile presets */}
							<div className="flex gap-1.5 overflow-x-auto border-b bg-background p-2 sm:hidden">
								{PRESET_RANGES.slice(0, 5).map((preset) => {
									const isActive = activePreset?.label === preset.label;
									return (
										<button
											className={cn(
												"shrink-0 rounded px-2.5 py-1.5 font-medium text-xs",
												isActive
													? "bg-primary text-primary-foreground"
													: "bg-secondary text-muted-foreground"
											)}
											key={preset.label}
											onClick={() => handlePresetSelect(preset)}
											type="button"
										>
											{preset.label}
										</button>
									);
								})}
							</div>

							{/* Calendar */}
							<div className="p-3">
								<Calendar
									defaultMonth={tempRange?.from || value?.from || new Date()}
									disabled={(date) => {
										if (minDate && date < minDate) return true;
										if (maxDate && date > maxDate) return true;
										return false;
									}}
									mode="range"
									numberOfMonths={isMobile ? 1 : 2}
									onSelect={handleCalendarSelect}
									selected={tempRange}
								/>
							</div>

							{/* Footer */}
							<div className="angled-rectangle-gradient flex items-center justify-end gap-2 border-t bg-secondary px-4 py-3">
								<Button
									onClick={() => handleOpenChange(false)}
									size="sm"
									variant="ghost"
								>
									Cancel
								</Button>
								<Button
									disabled={!hasValidSelection}
									onClick={handleApply}
									size="sm"
								>
									Apply
								</Button>
							</div>
						</div>
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
