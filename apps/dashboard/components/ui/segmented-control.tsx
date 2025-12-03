"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useId } from "react";

type SegmentedControlOption<T extends string> = {
	value: T;
	label: string;
};

type SegmentedControlProps<T extends string> = {
	options: SegmentedControlOption<T>[];
	value: T;
	onValueChangeAction: (value: T) => void;
	className?: string;
	size?: "sm" | "default";
};

export function SegmentedControl<T extends string>({
	options,
	value,
	onValueChangeAction,
	className,
	size = "default",
}: SegmentedControlProps<T>) {
	const layoutId = useId();

	return (
		<div
			className={cn(
				"relative inline-flex items-center rounded bg-accent/50 p-0.5",
				size === "sm" ? "h-8" : "h-9",
				className
			)}
			role="radiogroup"
		>
			{options.map((option) => {
				const isSelected = option.value === value;

				return (
					<button
						aria-checked={isSelected}
						className={cn(
							"relative z-10 flex items-center justify-center rounded px-2.5 font-medium transition-colors",
							size === "sm" ? "h-6 text-xs" : "h-7 text-xs",
							isSelected
								? "text-primary-foreground"
								: "text-muted-foreground hover:text-foreground"
						)}
						key={option.value}
						onClick={() => onValueChangeAction(option.value)}
						role="radio"
						type="button"
					>
						{isSelected && (
							<motion.span
								className={cn(
									"absolute inset-0 rounded bg-primary",
									size === "sm" ? "h-6" : "h-7"
								)}
								layoutId={layoutId}
								transition={{
									type: "spring",
									stiffness: 500,
									damping: 35,
								}}
							/>
						)}
						<span className="relative">{option.label}</span>
					</button>
				);
			})}
		</div>
	);
}
