"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			className={cn(
				"peer data-[state=unchecked]:badge-angled-rectangle-gradient data-[state=checked]:badge-angled-rectangle-gradient size-4 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-accent-brighter outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-brand-purple/50 data-[state=checked]:bg-brand-purple data-[state=unchecked]:bg-input data-[state=checked]:text-white disabled:data-[state=checked]:border-foreground dark:data-[state=unchecked]:bg-input/80 dark:aria-invalid:ring-destructive/40",
				className
			)}
			data-slot="checkbox"
			{...props}
		>
			<CheckboxPrimitive.Indicator
				className="flex items-center justify-center text-current transition-none"
				data-slot="checkbox-indicator"
			>
				<CheckIcon className="size-3.5" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
