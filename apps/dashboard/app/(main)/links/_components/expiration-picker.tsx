"use client";

import {
	CalendarIcon,
	CheckIcon,
	ClockIcon,
	InfinityIcon,
	XIcon,
} from "@phosphor-icons/react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

dayjs.extend(relativeTime);

interface ExpirationPreset {
	label: string;
	value: string;
	getDate: () => Date;
}

const EXPIRATION_PRESETS: ExpirationPreset[] = [
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

interface ExpirationPickerProps {
	value?: string;
	onChange: (value: string) => void;
	className?: string;
}

export function ExpirationPicker({
	value,
	onChange,
	className,
}: ExpirationPickerProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [showCustom, setShowCustom] = useState(false);
	const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
	const [customTime, setCustomTime] = useState("12:00");

	const currentDate = useMemo(() => {
		if (!value) {
			return null;
		}
		const parsed = dayjs(value);
		return parsed.isValid() ? parsed.toDate() : null;
	}, [value]);

	const activePreset = useMemo(() => {
		if (!currentDate) {
			return null;
		}
		const target = dayjs(currentDate);

		for (const preset of EXPIRATION_PRESETS) {
			const presetDate = dayjs(preset.getDate());
			const diffMinutes = Math.abs(target.diff(presetDate, "minute"));
			if (diffMinutes < 5) {
				return preset.value;
			}
		}
		return "custom";
	}, [currentDate]);

	const formatDisplay = useCallback((date: Date | null) => {
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
	}, []);

	const handlePresetSelect = useCallback(
		(preset: ExpirationPreset) => {
			const date = preset.getDate();
			onChange(dayjs(date).format("YYYY-MM-DDTHH:mm"));
			setShowCustom(false);
			setIsOpen(false);
		},
		[onChange]
	);

	const handleClear = useCallback(() => {
		onChange("");
		setShowCustom(false);
		setIsOpen(false);
	}, [onChange]);

	const handleCustomDateSelect = useCallback((date: Date | undefined) => {
		setCustomDate(date);
	}, []);

	const handleApplyCustom = useCallback(() => {
		if (!customDate) {
			return;
		}

		const [hours, minutes] = customTime.split(":").map(Number);
		const finalDate = dayjs(customDate).hour(hours).minute(minutes).second(0);

		onChange(finalDate.format("YYYY-MM-DDTHH:mm"));
		setShowCustom(false);
		setIsOpen(false);
	}, [customDate, customTime, onChange]);

	const handleOpenChange = useCallback(
		(open: boolean) => {
			setIsOpen(open);
			if (open) {
				setCustomDate(currentDate || undefined);
				setCustomTime(
					currentDate ? dayjs(currentDate).format("HH:mm") : "12:00"
				);
				setShowCustom(false);
			}
		},
		[currentDate]
	);

	const isExpired = currentDate && dayjs(currentDate).isBefore(dayjs());

	return (
		<Popover onOpenChange={handleOpenChange} open={isOpen}>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"h-9 w-full justify-start gap-2 px-3 text-left font-normal",
						!value && "text-muted-foreground",
						isExpired && "border-destructive/50 text-destructive",
						className
					)}
					type="button"
					variant="outline"
				>
					{value ? (
						<CalendarIcon className="size-4 shrink-0" weight="duotone" />
					) : (
						<InfinityIcon className="size-4 shrink-0" weight="duotone" />
					)}
					<span className="truncate">{formatDisplay(currentDate)}</span>
					{value && (
						<button
							className="ml-auto rounded p-0.5 hover:bg-accent"
							onClick={(e) => {
								e.stopPropagation();
								handleClear();
							}}
							type="button"
						>
							<XIcon className="size-3.5" />
						</button>
					)}
				</Button>
			</PopoverTrigger>

			<PopoverContent
				align="start"
				className="w-72 p-0"
				collisionPadding={16}
				side="bottom"
				sideOffset={4}
			>
				{showCustom ? (
					<div className="flex flex-col">
						{/* Header */}
						<div className="flex items-center justify-between border-b px-4 py-3">
							<button
								className="text-muted-foreground text-sm hover:text-foreground"
								onClick={() => setShowCustom(false)}
								type="button"
							>
								← Back
							</button>
							<span className="font-medium text-sm">Custom expiration</span>
							<div className="w-10" />
						</div>

						{/* Calendar */}
						<div className="p-3">
							<Calendar
								defaultMonth={customDate || new Date()}
								disabled={(date) => dayjs(date).isBefore(dayjs(), "day")}
								mode="single"
								onSelect={handleCustomDateSelect}
								selected={customDate}
							/>
						</div>

						{/* Time picker */}
						<div className="border-t px-4 py-3">
							<div className="flex items-center gap-3">
								<ClockIcon
									className="size-4 text-muted-foreground"
									weight="duotone"
								/>
								<span className="text-sm">Time</span>
								<input
									className="ml-auto h-8 rounded border bg-input px-2 text-center font-mono text-sm tabular-nums"
									onChange={(e) => setCustomTime(e.target.value)}
									type="time"
									value={customTime}
								/>
							</div>

							{customDate && (
								<p className="mt-2 text-muted-foreground text-xs">
									Expires{" "}
									{dayjs(customDate)
										.hour(Number.parseInt(customTime.split(":")[0], 10))
										.minute(Number.parseInt(customTime.split(":")[1], 10))
										.format("MMMM D, YYYY [at] h:mm A")}
								</p>
							)}
						</div>

						{/* Footer */}
						<div className="flex items-center justify-end gap-2 border-t bg-secondary/50 px-4 py-3">
							<Button
								onClick={() => setShowCustom(false)}
								size="sm"
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
							<Button
								disabled={!customDate}
								onClick={handleApplyCustom}
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
										className={cn(
											"flex w-full items-center justify-between rounded px-3 py-2 text-left transition-colors",
											isActive
												? "bg-primary text-primary-foreground"
												: "hover:bg-secondary"
										)}
										key={preset.value}
										onClick={() => handlePresetSelect(preset)}
										type="button"
									>
										<span className="text-sm">{preset.label}</span>
										<span
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

						<div className="my-2 h-px bg-border" />

						<div className="space-y-0.5">
							<button
								className={cn(
									"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
									activePreset === "custom" &&
										"bg-primary text-primary-foreground hover:bg-primary"
								)}
								onClick={() => setShowCustom(true)}
								type="button"
							>
								<CalendarIcon className="size-4" weight="duotone" />
								<span>Custom date & time</span>
								{activePreset === "custom" && (
									<CheckIcon className="ml-auto size-3.5" />
								)}
							</button>

							<button
								className={cn(
									"flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
									!value &&
										"bg-primary text-primary-foreground hover:bg-primary"
								)}
								onClick={handleClear}
								type="button"
							>
								<InfinityIcon className="size-4" weight="duotone" />
								<span>Never expires</span>
								{!value && <CheckIcon className="ml-auto size-3.5" />}
							</button>
						</div>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
