"use client";

import { cn } from "../lib/utils";
import type { ComponentProps, HTMLAttributes } from "react";
import { useEffect, useRef } from "react";
import {
	type DayButton,
	DayPicker,
	getDefaultClassNames,
} from "react-day-picker";
import {
	CaretDownIcon,
	CaretLeftIcon,
	CaretRightIcon,
} from "./icons";

type CalendarComponents = NonNullable<
	ComponentProps<typeof DayPicker>["components"]
>;

const CalendarRoot: NonNullable<CalendarComponents["Root"]> = ({
	className,
	rootRef,
	...props
}) => (
	<div
		className={cn(className)}
		data-slot="calendar"
		ref={rootRef}
		{...props}
	/>
);

const CalendarChevron: NonNullable<CalendarComponents["Chevron"]> = ({
	className,
	orientation,
	...props
}) => {
	if (orientation === "left") {
		return (
			<CaretLeftIcon
				className={cn("size-3.5", className)}
				{...props}
			/>
		);
	}
	if (orientation === "right") {
		return (
			<CaretRightIcon
				className={cn("size-3.5", className)}
				{...props}
			/>
		);
	}
	return (
		<CaretDownIcon
			className={cn("size-3.5", className)}
			{...props}
		/>
	);
};

const CalendarWeekNumber: NonNullable<CalendarComponents["WeekNumber"]> = ({
	children,
	...props
}) => (
	<td {...(props as HTMLAttributes<HTMLTableCellElement>)}>
		<div className="flex size-(--cell-size) items-center justify-center text-center">
			{children}
		</div>
	</td>
);

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	captionLayout = "label",
	formatters,
	components,
	...props
}: ComponentProps<typeof DayPicker>) {
	const defaultClassNames = getDefaultClassNames();

	return (
		<DayPicker
			captionLayout={captionLayout}
			className={cn(
				"group/calendar p-3 [--cell-size:--spacing(7)]",
				String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
				String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
				className
			)}
			classNames={{
				root: cn("w-fit", defaultClassNames.root),
				months: cn(
					"relative flex flex-col gap-4 md:flex-row",
					defaultClassNames.months
				),
				month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
				nav: cn(
					"absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
					defaultClassNames.nav
				),
				button_previous: cn(
					"inline-flex size-(--cell-size) cursor-pointer items-center justify-center rounded-md text-muted-foreground",
					"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"hover:bg-interactive-hover hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"aria-disabled:pointer-events-none aria-disabled:opacity-50",
					defaultClassNames.button_previous
				),
				button_next: cn(
					"inline-flex size-(--cell-size) cursor-pointer items-center justify-center rounded-md text-muted-foreground",
					"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
					"hover:bg-interactive-hover hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					"aria-disabled:pointer-events-none aria-disabled:opacity-50",
					defaultClassNames.button_next
				),
				month_caption: cn(
					"flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)",
					defaultClassNames.month_caption
				),
				dropdowns: cn(
					"flex h-(--cell-size) w-full items-center justify-center gap-1.5 font-medium text-xs",
					defaultClassNames.dropdowns
				),
				dropdown_root: cn(
					"relative rounded-md border border-border/60 has-focus:border-ring has-focus:ring-2 has-focus:ring-ring/50",
					defaultClassNames.dropdown_root
				),
				dropdown: cn("absolute inset-0 opacity-0", defaultClassNames.dropdown),
				caption_label: cn(
					"select-none font-medium text-xs",
					captionLayout !== "label" &&
						"flex h-(--cell-size) items-center gap-1 rounded-md pr-1 pl-2 [&>svg]:size-3.5 [&>svg]:text-muted-foreground",
					defaultClassNames.caption_label
				),
				month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"flex-1 select-none rounded-md text-center font-normal text-muted-foreground text-xs",
					defaultClassNames.weekday
				),
				week: cn("mt-1.5 flex w-full", defaultClassNames.week),
				week_number_header: cn(
					"w-(--cell-size) select-none",
					defaultClassNames.week_number_header
				),
				week_number: cn(
					"select-none text-muted-foreground text-xs",
					defaultClassNames.week_number
				),
				day: cn(
					"group/day relative aspect-square h-full w-full select-none p-0 text-center",
					defaultClassNames.day
				),
				range_start: cn(
					"rounded-l-md bg-primary/10",
					defaultClassNames.range_start
				),
				range_middle: cn("bg-primary/10", defaultClassNames.range_middle),
				range_end: cn(
					"rounded-r-md bg-primary/10",
					defaultClassNames.range_end
				),
				today: cn("rounded-md", defaultClassNames.today),
				outside: cn(
					"text-muted-foreground/50 aria-selected:text-muted-foreground/70",
					defaultClassNames.outside
				),
				disabled: cn(
					"text-muted-foreground opacity-50",
					defaultClassNames.disabled
				),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Root: CalendarRoot,
				Chevron: CalendarChevron,
				DayButton: CalendarDayButton,
				WeekNumber: CalendarWeekNumber,
				...components,
			}}
			formatters={{
				formatMonthDropdown: (date) =>
					date.toLocaleString("default", { month: "short" }),
				...formatters,
			}}
			showOutsideDays={showOutsideDays}
			{...props}
		/>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	...props
}: ComponentProps<typeof DayButton>) {
	const defaultClassNames = getDefaultClassNames();
	const ref = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (modifiers.focused) {
			ref.current?.focus();
		}
	}, [modifiers.focused]);

	const isRangeEndpoint = modifiers.range_start || modifiers.range_end;
	const isRangeMiddle = modifiers.range_middle;
	const isSelectedSingle =
		modifiers.selected && !isRangeEndpoint && !isRangeMiddle;
	const isPrimary = isRangeEndpoint || isSelectedSingle;

	return (
		<button
			className={cn(
				"inline-flex aspect-square size-auto w-full min-w-(--cell-size) cursor-pointer items-center justify-center rounded-md font-normal text-xs leading-none",
				"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
				"hover:bg-interactive-hover hover:text-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				modifiers.today && "font-semibold",
				modifiers.today &&
					!isPrimary &&
					!isRangeMiddle &&
					"bg-accent text-accent-foreground",
				isRangeMiddle && "rounded-none text-foreground",
				isPrimary &&
					"bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
				modifiers.range_start && "rounded-l-md",
				modifiers.range_end && "rounded-r-md",
				defaultClassNames.day,
				className
			)}
			data-day={day.date.toLocaleDateString()}
			data-today={modifiers.today || undefined}
			ref={ref}
			type="button"
			{...props}
		/>
	);
}

export { Calendar, CalendarDayButton };
