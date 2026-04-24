"use client";

import { cn } from "@/lib/utils";
import { Checkbox as BaseCheckbox } from "@base-ui-components/react/checkbox";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

type CheckboxProps = ComponentPropsWithoutRef<typeof BaseCheckbox.Root> & {
	label?: ReactNode;
	description?: ReactNode;
};

export function Checkbox({
	className,
	label,
	description,
	...rest
}: CheckboxProps) {
	const id = useId();
	const labelId = `${id}-label`;
	const descriptionId = `${id}-description`;
	const control = (
		<BaseCheckbox.Root
			aria-describedby={description ? descriptionId : undefined}
			aria-labelledby={label ? labelId : rest["aria-labelledby"]}
			className={cn(
				"inline-flex size-4 shrink-0 cursor-pointer select-none items-center justify-center rounded-sm",
				"bg-secondary",
				"transition-[background-color,color,box-shadow,opacity] duration-(--duration-quick) ease-(--ease-smooth)",
				"motion-reduce:transition-none",
				"data-checked:bg-primary data-checked:text-primary-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
				"disabled:cursor-not-allowed disabled:opacity-50",
				!label && className
			)}
			{...rest}
		>
			<BaseCheckbox.Indicator className="flex items-center justify-center text-current">
				<Check className="size-3" />
			</BaseCheckbox.Indicator>
		</BaseCheckbox.Root>
	);

	if (!label) {
		return control;
	}

	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: this is a control
		<label
			className={cn(
				"group flex cursor-pointer select-none gap-2",
				description ? "items-start" : "items-center",
				className
			)}
		>
			<span className={cn("flex shrink-0 items-center", description && "h-5")}>
				{control}
			</span>
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
