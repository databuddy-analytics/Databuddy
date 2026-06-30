"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
	CalendarDotsIcon,
	CaretRightIcon,
	CheckIcon,
} from "@databuddy/ui/icons";
import { Calendar, Popover } from "@databuddy/ui/client";
import { Button, dayjs, formatLocalTime } from "@databuddy/ui";

interface PresetRange {
	getValue: () => DateRange;
	label: string;
}

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
			to: dayjs().subtract(1, "month").endOf("month").toDate(),
		}),
	},
];

interface DateRangePickerProps {
	className?: string;
	disabled?: boolean;
	maxDate?: Date;
	minDate?: Date;
	onChange?: (dateRange: DateRange | undefined) => void;
	value?: DateRange;
}

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
		if (!(tempRange?.from && tempRange?.to)) {
			return 0;
		}
		return dayjs(tempRange.to).diff(dayjs(tempRange.from), "day") + 1;
	}, [tempRange]);

	const activePreset = useMemo(() => {
		if (!(tempRange?.from && tempRange?.to)) {
			return null;
		}
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
		if (!(range?.from && range?.to)) {
			return "Select dates";
		}

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
				<Popover.Trigger
					className={cn(
						"inline-flex h-8 cursor-pointer items-center justify-start gap-2 whitespace-nowrap rounded-md bg-secondary px-3 text-left font-medium text-foreground text-xs",
						"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
						"hover:bg-interactive-hover",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
						"disabled:pointer-events-none disabled:opacity-50",
						!value?.from && "text-muted-foreground"
					)}
					disabled={disabled}
				>
					<CalendarDotsIcon
						className="size-3.5 text-muted-foreground"
						weight="duotone"
					/>
					<span className="truncate">{formatDisplayRange(value)}</span>
				</Popover.Trigger>

				<Popover.Content
					className="w-auto overflow-hidden p-0"
					disableAnchorTracking
					side="bottom"
				>
					<div className="flex">
						<div className="hidden w-36 shrink-0 border-border/60 border-r sm:block">
							<div className="p-1.5">
								<p className="px-2 py-1.5 font-medium text-muted-foreground text-xs uppercase">
									Quick select
								</p>
								<div className="space-y-0.5">
									{PRESET_RANGES.map((preset) => {
										const isActive = activePreset?.label === preset.label;
										return (
											<button
												className={cn(
													"flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-left text-xs",
													"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
													isActive
														? "bg-primary text-primary-foreground"
														: "text-muted-foreground hover:bg-interactive-hover hover:text-foreground"
												)}
												key={preset.label}
												onClick={() => handlePresetSelect(preset)}
												type="button"
											>
												<span>{preset.label}</span>
												{isActive && <CheckIcon className="size-3" />}
											</button>
										);
									})}
								</div>
							</div>
						</div>

						<div className="flex flex-col">
							<div className="flex items-center justify-between border-border/60 border-b px-4 py-2.5">
								<div className="flex items-center gap-2">
									{tempRange?.from ? (
										<>
											<div className="rounded-md bg-secondary px-2 py-1">
												<span className="font-medium text-foreground text-xs tabular-nums">
													{formatLocalTime(tempRange.from, "MMM D")}
												</span>
											</div>
											<CaretRightIcon
												className="size-3 text-muted-foreground"
												weight="bold"
											/>
											<div
												className={cn(
													"rounded-md px-2 py-1",
													tempRange?.to
														? "bg-secondary"
														: "border border-border border-dashed"
												)}
											>
												<span
													className={cn(
														"font-medium text-xs tabular-nums",
														tempRange?.to
															? "text-foreground"
															: "text-muted-foreground"
													)}
												>
													{tempRange?.to
														? formatLocalTime(tempRange.to, "MMM D")
														: "End date"}
												</span>
											</div>
										</>
									) : (
										<span className="text-muted-foreground text-xs">
											Select a date range
										</span>
									)}
								</div>
								{daysDiff > 0 && (
									<span className="ml-3 rounded-md bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs tabular-nums">
										{daysDiff} day{daysDiff === 1 ? "" : "s"}
									</span>
								)}
							</div>

							<div className="flex gap-1 overflow-x-auto border-border/60 border-b p-1.5 sm:hidden">
								{PRESET_RANGES.slice(0, 5).map((preset) => {
									const isActive = activePreset?.label === preset.label;
									return (
										<button
											className={cn(
												"shrink-0 cursor-pointer rounded-md px-2.5 py-1.5 font-medium text-xs",
												"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
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

							<div className="p-2">
								<Calendar
									defaultMonth={tempRange?.from || value?.from || new Date()}
									disabled={(date) => {
										if (minDate && date < minDate) {
											return true;
										}
										if (maxDate && date > maxDate) {
											return true;
										}
										return false;
									}}
									mode="range"
									numberOfMonths={isMobile ? 1 : 2}
									onSelect={handleCalendarSelect}
									selected={tempRange}
								/>
							</div>

							<div className="flex items-center justify-end gap-2 border-border/60 border-t px-3 py-2.5">
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
				</Popover.Content>
			</Popover>
		</div>
	);
}
