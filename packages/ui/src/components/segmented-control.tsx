"use client";

import { cn } from "../lib/utils";
import { useId } from "react";
import type { HTMLAttributes, ReactNode } from "react";

interface SegmentedControlOption<T extends string> {
	label: ReactNode;
	value: T;
}

interface SegmentedControlProps<T extends string>
	extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
	disabled?: boolean;
	name?: string;
	onChange: (value: T) => void;
	options: SegmentedControlOption<T>[];
	size?: "sm" | "md";
	value: T;
	variant?: "default" | "pill";
}

function SegmentedControl<T extends string>({
	options,
	value,
	onChange,
	size = "md",
	variant = "default",
	className,
	disabled = false,
	name,
	...rest
}: SegmentedControlProps<T>) {
	const generatedName = useId();
	const groupName = name ?? generatedName;

	return (
		<div
			className={cn(
				"inline-flex items-center rounded-md bg-secondary",
				size === "sm" ? "h-8 gap-0.5 p-0.5" : "gap-1 p-1",
				disabled && "pointer-events-none opacity-50",
				className
			)}
			role="radiogroup"
			{...rest}
		>
			{options.map((option) => {
				const isSelected = option.value === value;

				return (
					<label
						className={cn(
							"relative flex min-w-0 cursor-pointer items-center justify-center rounded-md font-medium",
							"transition-colors duration-(--duration-quick) ease-(--ease-smooth)",
							"focus-within:ring-2 focus-within:ring-ring/60",
							size === "sm" ? "h-6 px-2 text-[11px]" : "h-6 px-3 text-xs",
							isSelected
								? variant === "pill"
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-card text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						)}
						key={option.value}
					>
						<input
							checked={isSelected}
							className="sr-only"
							disabled={disabled}
							name={groupName}
							onChange={() => onChange(option.value)}
							type="radio"
							value={option.value}
						/>
						{option.label}
					</label>
				);
			})}
		</div>
	);
}

export { SegmentedControl };
export type { SegmentedControlOption, SegmentedControlProps };
