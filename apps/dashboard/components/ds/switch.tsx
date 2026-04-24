"use client";

import { cn } from "@/lib/utils";
import { Switch as BaseSwitch } from "@base-ui-components/react/switch";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

type SwitchProps = ComponentPropsWithoutRef<typeof BaseSwitch.Root> & {
	label?: ReactNode;
	description?: ReactNode;
};

export function Switch({
	className,
	label,
	description,
	...rest
}: SwitchProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const descriptionId = `${id}-description`;
	const control = (
		<BaseSwitch.Root
			aria-describedby={description ? descriptionId : undefined}
			aria-labelledby={label ? labelId : rest["aria-labelledby"]}
			className={cn(
				"group relative inline-flex h-5 w-9 shrink-0 cursor-pointer select-none items-center rounded-full p-0.5",
				"bg-input",
				"transition-colors duration-(--duration-base) ease-(--expo-out)",
				"motion-reduce:transition-none",
				"data-checked:bg-primary",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				"disabled:cursor-not-allowed disabled:opacity-50",
				!label && className
			)}
			{...rest}
		>
			<BaseSwitch.Thumb
				className={cn(
					"pointer-events-none block size-4 rounded-full bg-foreground",
					"shadow-[0_1px_2px_rgb(0_0_0_/_0.18),0_0_0_0.5px_rgb(0_0_0_/_0.08)]",
					"transition-[transform,background-color] [transition-duration:var(--duration-base),120ms] [transition-timing-function:var(--expo-out),var(--ease-smooth)]",
					"motion-reduce:transition-none",
					"data-unchecked:translate-x-0",
					"data-checked:translate-x-4 data-checked:bg-primary-foreground",
					"group-active:scale-95"
				)}
			/>
		</BaseSwitch.Root>
	);

	if (!label) {
		return control;
	}

	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: this is a control
		<label
			className={cn("group flex cursor-pointer select-none gap-2", className)}
		>
			<span className="flex h-5 items-center">{control}</span>
			<span className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span className="font-medium text-foreground text-xs" id={labelId}>
					{label}
				</span>
				{description ? (
					<span
						className="text-[11px] text-muted-foreground"
						id={descriptionId}
					>
						{description}
					</span>
				) : null}
			</span>
		</label>
	);
}
