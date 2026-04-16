import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded border px-2 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
	{
		variants: {
			variant: {
				default:
					"border border-brand-purple/35 bg-brand-purple text-white dark:border-brand-purple/55 dark:bg-brand-purple dark:text-white [a&]:hover:bg-brand-purple/90",
				gray: "border border-border bg-muted text-muted-foreground dark:border-border dark:bg-secondary dark:text-muted-foreground [a&]:hover:bg-muted/90",
				blue: "border border-brand-purple/25 bg-brand-purple/10 text-brand-purple dark:border-brand-purple/40 dark:bg-brand-purple/18 dark:text-[#C9BFE8] [a&]:hover:bg-brand-purple/15",
				green:
					"border border-emerald-600/25 bg-emerald-50 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-950/50 dark:text-emerald-300 [a&]:hover:bg-emerald-100/90",
				amber:
					"border border-brand-amber/30 bg-brand-amber/12 text-amber-950 dark:border-brand-amber/40 dark:bg-brand-amber/14 dark:text-amber-300 [a&]:hover:bg-brand-amber/18",
				secondary:
					"border border-foreground/15 bg-foreground text-background dark:border-foreground/25 dark:bg-foreground dark:text-background [a&]:hover:bg-foreground/90",
				destructive:
					"border border-brand-coral/30 bg-brand-coral/12 text-brand-coral focus-visible:ring-brand-coral/20 dark:border-brand-coral/45 dark:bg-brand-coral/22 dark:text-[#E8A8BE] [a&]:hover:bg-brand-coral/18",
				outline:
					"border border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp
			className={cn(badgeVariants({ variant }), className)}
			data-slot="badge"
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
