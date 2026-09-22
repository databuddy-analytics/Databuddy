import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	[
		"inline-flex shrink-0 items-center justify-center whitespace-nowrap",
		"cursor-pointer gap-2 rounded-md font-medium outline-none",
		"transition-[background-color,color,opacity,transform,filter,box-shadow] duration-(--duration-quick) ease-(--ease-smooth)",
		"motion-reduce:transition-none",
		"focus-visible:ring-2 focus-visible:ring-ring/60",
		"active:scale-[0.98] motion-reduce:active:scale-100",
		"disabled:pointer-events-none disabled:opacity-50",
		"[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	].join(" "),
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-xs hover:brightness-[1.15] active:brightness-[0.9] dark:active:brightness-[0.75] dark:hover:brightness-[0.85]",
				destructive:
					"bg-destructive text-destructive-foreground shadow-xs hover:brightness-[1.15]",
				outline:
					"border border-border/60 bg-card text-foreground hover:bg-interactive-hover active:bg-interactive-active",
				secondary:
					"bg-secondary text-foreground hover:bg-interactive-hover active:bg-interactive-active",
				ghost:
					"bg-transparent text-muted-foreground hover:bg-interactive-hover hover:text-foreground active:bg-interactive-active active:text-foreground",
			},
			size: {
				default: "h-8 px-3 text-xs has-[>svg]:px-2.5",
				sm: "h-7 gap-1.5 px-2.5 text-xs has-[>svg]:px-2",
				lg: "h-9 px-4 text-sm has-[>svg]:px-3",
				icon: "size-8",
				"icon-sm": "size-7",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button,  };
