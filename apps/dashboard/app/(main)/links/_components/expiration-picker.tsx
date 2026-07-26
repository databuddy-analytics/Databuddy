"use client";

import { useState } from "react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
	CalendarIcon,
	CheckIcon,
	ClockIcon,
	InfinityIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Calendar } from "@databuddy/ui/client";
import { Button, dayjs } from "@databuddy/ui";

const EXPIRATION_PRESETS = [
	{
		label: "1 hour",
		value: "1h",
		getDate: () => dayjs().add(1, "hour").toDate(),
	},
	{
		label: "24 hours",
		value: "24h",
		getDate: () => dayjs().add(24, "hour").toDate(),
	},
	{
		label: "7 days",
		value: "7d",
		getDate: () => dayjs().add(7, "day").toDate(),
	},
	{
		label: "30 days",
		value: "30d",
		getDate: () => dayjs().add(30, "day").toDate(),
	},
	{
		label: "90 days",
		value: "90d",
		getDate: () => dayjs().add(90, "day").toDate(),
	},
	{
		label: "1 year",
		value: "1y",
		getDate: () => dayjs().add(1, "year").toDate(),
	},
];

type ExpirationPreset = (typeof EXPIRATION_PRESETS)[number];

function formatPresetPreview(preset: ExpirationPreset): string {
	const date = dayjs(preset.getDate());
	const now = dayjs();

	if (date.diff(now, "hour") < 24) {
		return date.format("h:mm A");
	}

	if (date.diff(now, "day") < 7) {
		return date.format("ddd, h:mm A");
	}

	return date.format("MMM D, YYYY");
}

function formatDisplay(date: Date | null): string {
	if (!date) {
		return "Never expires";
	}

	const now = dayjs();
	const target = dayjs(date);
	const diffHours = target.diff(now, "hour");
	const diffDays = target.diff(now, "day");

	if (diffHours < 0) {
		return `Expired ${target.fromNow()}`;
	}

	if (diffHours < 24) {
		return `Expires in ${diffHours}h · ${target.format("h:mm A")}`;
	}

	if (diffDays < 7) {
		return `Expires in ${diffDays}d · ${target.format("ddd, MMM D")}`;
	}

	return `Expires ${target.format("MMM D, YYYY")}`;
}

function withTime(date: Date, time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	return dayjs(date).hour(hours).minute(minutes).second(0);
}

interface ExpirationPickerProps {
	className?: string;
	onChange: (value: string) => void;
	value?: string;
}

export function ExpirationPicker({
	value,
	onChange,
	className,
}: ExpirationPickerProps) {
	const [picker, setPicker] = useState({
		customDate: undefined as Date | undefined,
		customTime: "12:00",
		isOpen: false,
		showCustom: false,
	});
	const parsedValue = value ? dayjs(value) : null;
	const currentDate = parsedValue?.isValid() ? parsedValue.toDate() : null;
	const activePreset = currentDate
		? (EXPIRATION_PRESETS.find(
				(preset) =>
					Math.abs(dayjs(currentDate).diff(dayjs(preset.getDate()), "minute")) <
					5
			)?.value ?? "custom")
		: null;
	const isExpired = currentDate && dayjs(currentDate).isBefore(dayjs());

	const closePicker = () => {
		setPicker((state) => ({ ...state, isOpen: false, showCustom: false }));
	};
	const showPresets = () => {
		setPicker((state) => ({ ...state, showCustom: false }));
	};
	const showCustom = () => {
		setPicker((state) => ({ ...state, showCustom: true }));
	};

	const selectPreset = (preset: ExpirationPreset) => {
		onChange(dayjs(preset.getDate()).format("YYYY-MM-DDTHH:mm"));
		closePicker();
	};

	const clearExpiration = () => {
		onChange("");
		closePicker();
	};

	const applyCustom = () => {
		if (!picker.customDate) {
			return;
		}

		onChange(
			withTime(picker.customDate, picker.customTime).format("YYYY-MM-DDTHH:mm")
		);
		closePicker();
	};

	return (
		<Popover
			onOpenChange={(isOpen) => {
				setPicker((state) => ({
					...state,
					customDate: isOpen ? (currentDate ?? undefined) : state.customDate,
					customTime: isOpen
						? currentDate
							? dayjs(currentDate).format("HH:mm")
							: "12:00"
						: state.customTime,
					isOpen,
					showCustom: isOpen ? false : state.showCustom,
				}));
			}}
			open={picker.isOpen}
		>
			<div className="relative flex items-center">
				<PopoverTrigger asChild>
					<Button
						className={cn(
							"h-9 w-full justify-start gap-2 px-3 pr-8 text-left font-normal",
							!value && "text-muted-foreground",
							isExpired && "border-destructive/50 text-destructive",
							className
						)}
						type="button"
						variant="outline"
					>
						{value ? (
							<CalendarIcon
								aria-hidden="true"
								className="size-4 shrink-0"
								weight="duotone"
							/>
						) : (
							<InfinityIcon
								aria-hidden="true"
								className="size-4 shrink-0"
								weight="duotone"
							/>
						)}
						<span className="truncate">{formatDisplay(currentDate)}</span>
					</Button>
				</PopoverTrigger>
				{value && (
					<button
						aria-label="Clear expiration"
						className="absolute right-2 rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onClick={(e) => {
							e.stopPropagation();
							clearExpiration();
						}}
						type="button"
					>
						<XIcon aria-hidden="true" className="size-3.5" />
					</button>
				)}
			</div>

			<PopoverContent
				align="start"
				className="w-72 p-0"
				collisionPadding={16}
				side="bottom"
				sideOffset={4}
			>
				{picker.showCustom ? (
					<div className="flex flex-col">
						<div className="flex items-center justify-between border-b px-4 py-3">
							<button
								aria-label="Go back to presets"
								className="rounded text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={showPresets}
								type="button"
							>
								← Back
							</button>
							<span className="font-medium text-sm">Custom expiration</span>
							<div className="w-10" />
						</div>

						<div className="p-3">
							<Calendar
								defaultMonth={picker.customDate || new Date()}
								disabled={(date) => dayjs(date).isBefore(dayjs(), "day")}
								mode="single"
								onSelect={(customDate) =>
									setPicker((state) => ({ ...state, customDate }))
								}
								selected={picker.customDate}
							/>
						</div>

						<div className="border-t px-4 py-3">
							<div className="flex items-center gap-3">
								<ClockIcon
									aria-hidden="true"
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
								<label className="text-sm" htmlFor="expiration-time">
									Time
								</label>
								<input
									className="ml-auto h-8 rounded border bg-input px-2 text-center font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
									id="expiration-time"
									onChange={(e) =>
										setPicker((state) => ({
											...state,
											customTime: e.target.value,
										}))
									}
									type="time"
									value={picker.customTime}
								/>
							</div>

							{picker.customDate && (
								<p
									aria-live="polite"
									className="mt-2 text-muted-foreground text-xs"
								>
									Expires{" "}
									{withTime(picker.customDate, picker.customTime).format(
										"MMMM D, YYYY [at] h:mm A"
									)}
								</p>
							)}
						</div>

						<div className="flex items-center justify-end gap-2 border-t bg-secondary/50 px-4 py-3">
							<Button
								onClick={showPresets}
								size="sm"
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button
								disabled={!picker.customDate}
								onClick={applyCustom}
								size="sm"
								type="button"
							>
								Apply
							</Button>
						</div>
					</div>
				) : (
					<div className="p-2">
						<p className="px-2 py-1.5 font-medium text-[11px] text-muted-foreground uppercase">
							Expire after
						</p>
						<div className="space-y-0.5">
							{EXPIRATION_PRESETS.map((preset) => {
								const isActive = activePreset === preset.value;
								const previewText = formatPresetPreview(preset);
								return (
									<button
										aria-pressed={isActive}
										className={cn(
											"flex w-full items-center justify-between rounded px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
											isActive
												? "bg-primary text-primary-foreground"
												: "hover:bg-secondary"
										)}
										key={preset.value}
										onClick={() => selectPreset(preset)}
										type="button"
									>
										<span className="text-sm">{preset.label}</span>
										<span
											aria-hidden="true"
											className={cn(
												"text-xs tabular-nums",
												isActive
													? "text-primary-foreground/70"
													: "text-muted-foreground"
											)}
										>
											{previewText}
										</span>
									</button>
								);
							})}
						</div>

						<div aria-hidden="true" className="my-2 h-px bg-border" />

						<div className="space-y-0.5">
							<button
								aria-pressed={activePreset === "custom"}
								className={cn(
									"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
									activePreset === "custom" &&
										"bg-primary text-primary-foreground hover:bg-primary"
								)}
								onClick={showCustom}
								type="button"
							>
								<CalendarIcon
									aria-hidden="true"
									className="size-4"
									weight="duotone"
								/>
								<span>Custom date & time</span>
								{activePreset === "custom" && (
									<CheckIcon aria-hidden="true" className="ml-auto size-3.5" />
								)}
							</button>

							<button
								aria-pressed={!value}
								className={cn(
									"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
									!value &&
										"bg-primary text-primary-foreground hover:bg-primary"
								)}
								onClick={clearExpiration}
								type="button"
							>
								<InfinityIcon
									aria-hidden="true"
									className="size-4"
									weight="duotone"
								/>
								<span>Never expires</span>
								{!value && (
									<CheckIcon aria-hidden="true" className="ml-auto size-3.5" />
								)}
							</button>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
