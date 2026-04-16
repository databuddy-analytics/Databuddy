"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Switch({
	className,
	...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			className={cn(
				"peer data-[state=checked]:badge-angled-rectangle-gradient data-[state=unchecked]:badge-angled-rectangle-gradient inline-flex h-[1.15rem] w-9 shrink-0 cursor-pointer items-center overflow-hidden rounded-sm border border-accent-brighter outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary/50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input disabled:data-[state=checked]:border-foreground dark:data-[state=unchecked]:bg-input/80",
				className
			)}
			data-slot="switch"
			{...props}
		>
			<SwitchPrimitive.Thumb
				className={cn(
					"pointer-events-none block h-full w-4 rounded-sm bg-background ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%+2px)] data-[state=unchecked]:translate-x-0 data-[state=checked]:rotate-90 data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground"
				)}
				data-slot="switch-thumb"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
