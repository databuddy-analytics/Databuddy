"use client";

import { DATE_FORMATS, formatDate } from "@lib/formatters";
import { CalendarIcon } from "@phosphor-icons/react";
import { ClockIcon } from "@phosphor-icons/react";
import { LightningIcon } from "@phosphor-icons/react";
import { PlusIcon } from "@phosphor-icons/react";
import { PowerIcon } from "@phosphor-icons/react";
import { TrashIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { FormField, FormItem } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ScheduleManagerProps } from "./types";

type ScheduleType = "enable" | "disable" | "update_rollout";

function DateTimePicker({
	value,
	onChange,
}: {
	value: string | undefined;
	onChange: (date: string) => void;
}) {
	const dateValue = value ? new Date(value) : undefined;

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					className={cn(
						"h-9 w-full justify-start gap-2 text-left font-normal",
						!value && "text-muted-foreground"
					)}
					type="button"
					variant="outline"
				>
					<CalendarIcon size={14} />
					{value
						? formatDate(new Date(value), DATE_FORMATS.DATE_TIME_12H)
						: "Select date & time…"}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-0">
				<Calendar
					mode="single"
					onSelect={(date) => {
						if (date) {
							const currentTime = dateValue || new Date();
							date.setHours(currentTime.getHours());
							date.setMinutes(currentTime.getMinutes());
							onChange(date.toISOString());
						}
					}}
					selected={dateValue}
				/>
				<div className="flex items-center gap-2 border-t p-3">
					<ClockIcon className="text-muted-foreground" size={14} />
					<Input
						className="h-8 flex-1"
						defaultValue={
							value ? formatDate(new Date(value), DATE_FORMATS.TIME_ONLY) : ""
						}
						onChange={(e) => {
							const date = dateValue || new Date();
							const [h, m] = e.target.value.split(":");
							date.setHours(Number(h), Number(m));
							onChange(date.toISOString());
						}}
						type="time"
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function ScheduleManager({ form, flagId }: ScheduleManagerProps) {
	const scheduleEnabled = form.watch("schedule.isEnabled");
	const scheduleType = form.watch("schedule.type") as ScheduleType | undefined;
	const rolloutSteps = form.watch("schedule.rolloutSteps") || [];
	const flagType = form.watch("flag.type");
	const isRolloutFlag = flagType === "rollout";

	const enableSchedule = (type: ScheduleType) => {
		form.setValue("schedule.isEnabled", true);
		form.setValue("schedule.type", type);
		if (flagId) {
			form.setValue("schedule.flagId", flagId);
		}
		if (type === "update_rollout" && rolloutSteps.length === 0) {
			const oneHourFromNow = new Date();
			oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);
			form.setValue("schedule.rolloutSteps", [
				{
					scheduledAt: oneHourFromNow.toISOString(),
					value: 25,
				},
			]);
		}
	};

	const disableSchedule = () => {
		form.setValue("schedule", undefined);
	};

	const addRolloutStep = () => {
		const lastStep = rolloutSteps.at(-1);
		const nextDate = lastStep
			? new Date(new Date(lastStep.scheduledAt).getTime() + 24 * 60 * 60 * 1000)
			: (() => {
					const d = new Date();
					d.setHours(d.getHours() + 1);
					return d;
				})();
		const nextValue = lastStep
			? Math.min(Number(lastStep.value) + 25, 100)
			: 25;

		form.setValue("schedule.rolloutSteps", [
			...rolloutSteps,
			{
				scheduledAt: nextDate.toISOString(),
				value: nextValue,
			},
		]);
	};

	const removeRolloutStep = (index: number) => {
		const filtered = rolloutSteps.filter((_, i) => i !== index);
		form.setValue("schedule.rolloutSteps", filtered);
		if (filtered.length === 0 && scheduleType === "update_rollout") {
			disableSchedule();
		}
	};

	const updateRolloutStep = (
		index: number,
		field: "scheduledAt" | "value",
		value: string | number
	) => {
		const newSteps = [...rolloutSteps];
		newSteps[index] = { ...newSteps[index], [field]: value };
		form.setValue("schedule.rolloutSteps", newSteps);
	};

	// Not enabled - show options
	if (!scheduleEnabled) {
		return (
			<div className="space-y-2">
				<div className="grid gap-2 sm:grid-cols-2">
					<button
						className="flex items-center gap-3 rounded border border-transparent bg-secondary p-3 text-left transition-all hover:border-green-500/30 hover:bg-green-500/5"
						onClick={() => enableSchedule("enable")}
						type="button"
					>
						<div className="flex size-8 items-center justify-center rounded bg-green-500/10">
							<PowerIcon className="text-green-500" size={16} weight="fill" />
						</div>
						<div>
							<p className="font-medium text-sm">Enable</p>
							<p className="text-muted-foreground text-xs">At a set time</p>
						</div>
					</button>

					<button
						className="flex items-center gap-3 rounded border border-transparent bg-secondary p-3 text-left transition-all hover:border-red-500/30 hover:bg-red-500/5"
						onClick={() => enableSchedule("disable")}
						type="button"
					>
						<div className="flex size-8 items-center justify-center rounded bg-red-500/10">
							<PowerIcon
								className="rotate-180 text-red-500"
								size={16}
								weight="fill"
							/>
						</div>
						<div>
							<p className="font-medium text-sm">Disable</p>
							<p className="text-muted-foreground text-xs">At a set time</p>
						</div>
					</button>
				</div>

				{isRolloutFlag && (
					<button
						className="flex w-full items-center gap-3 rounded border border-transparent bg-secondary p-3 text-left transition-all hover:border-primary/30 hover:bg-primary/5"
						onClick={() => enableSchedule("update_rollout")}
						type="button"
					>
						<div className="flex size-8 items-center justify-center rounded bg-primary/10">
							<LightningIcon className="text-primary" size={16} weight="fill" />
						</div>
						<div>
							<p className="font-medium text-sm">Gradual rollout</p>
							<p className="text-muted-foreground text-xs">
								Increase percentage over time
							</p>
						</div>
					</button>
				)}
			</div>
		);
	}

	// Enabled - show configuration
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					{scheduleType === "enable" && (
						<PowerIcon className="text-green-500" size={16} weight="fill" />
					)}
					{scheduleType === "disable" && (
						<PowerIcon
							className="rotate-180 text-red-500"
							size={16}
							weight="fill"
						/>
					)}
					{scheduleType === "update_rollout" && (
						<LightningIcon className="text-primary" size={16} weight="fill" />
					)}
					<span className="font-medium text-sm">
						{scheduleType === "enable"
							? "Enable on schedule"
							: scheduleType === "disable"
								? "Disable on schedule"
								: "Gradual rollout"}
					</span>
				</div>
				<button
					className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
					onClick={disableSchedule}
					type="button"
				>
					<XIcon size={14} />
				</button>
			</div>

			{scheduleType !== "update_rollout" && (
				<FormField
					control={form.control}
					name="schedule.scheduledAt"
					render={({ field }) => (
						<FormItem>
							<DateTimePicker onChange={field.onChange} value={field.value} />
						</FormItem>
					)}
				/>
			)}

			{scheduleType === "update_rollout" && (
				<div className="space-y-3">
					<AnimatePresence mode="popLayout">
						{rolloutSteps.map((step, index) => (
							<motion.div
								animate={{ opacity: 1, y: 0 }}
								className="grid grid-cols-[1fr_auto_auto] items-center gap-2"
								exit={{ opacity: 0, y: -10 }}
								initial={{ opacity: 0, y: 10 }}
								key={`${step.scheduledAt ?? ""}-${step.value}-${index}`}
								layout
							>
								<DateTimePicker
									onChange={(date) =>
										updateRolloutStep(index, "scheduledAt", date)
									}
									value={step.scheduledAt}
								/>
								<div className="flex items-center gap-1">
									<Input
										className="h-9 w-16 text-center"
										max={100}
										min={0}
										onChange={(e) =>
											updateRolloutStep(index, "value", Number(e.target.value))
										}
										type="number"
										value={step.value}
									/>
									<span className="text-muted-foreground text-sm">%</span>
								</div>
								<button
									className="flex size-9 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
									onClick={() => removeRolloutStep(index)}
									type="button"
								>
									<TrashIcon size={14} />
								</button>
							</motion.div>
						))}
					</AnimatePresence>

					<Button
						className="w-full text-muted-foreground"
						onClick={addRolloutStep}
						size="sm"
						type="button"
						variant="outline"
					>
						<PlusIcon size={14} />
						Add step
					</Button>
				</div>
			)}
		</div>
	);
}
