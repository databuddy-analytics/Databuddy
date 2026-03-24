import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded border px-2 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
	{
		variants: {
			variant: {
				default:
					'badge-angled-rectangle-gradient border border-brand-purple/30 bg-brand-purple text-white [a&]:hover:bg-brand-purple/90 dark:border-brand-purple/50 dark:bg-brand-purple/80',
				gray:
					'border angled-rectangle-gradient border-border bg-accent text-accent-foreground [a&]:hover:bg-secondary/90 dark:border-border dark:bg-accent/50',
				blue:
					'border border-brand-purple/20 blue-angled-rectangle-gradient bg-brand-purple/10 text-brand-purple [a&]:hover:bg-brand-purple/15 dark:border-brand-purple/30 dark:bg-brand-purple/20 dark:text-[#8B80BF]',
				green:
					'border border-emerald-600/20 green-angled-rectangle-gradient bg-emerald-50 text-emerald-700 [a&]:hover:bg-emerald-100/90 dark:border-emerald-700/30 dark:bg-emerald-900/20 dark:text-emerald-400',
				amber:
					'amber-angled-rectangle-gradient border border-brand-amber/20 bg-brand-amber/10 text-brand-amber [a&]:hover:bg-brand-amber/15 dark:border-brand-amber/30 dark:bg-brand-amber/15 dark:text-[#F0BA4D]',
				secondary:
					'border border-foreground/20 dark-angled-rectangle-gradient bg-foreground text-background [a&]:hover:bg-foreground/90 dark:border-foreground/30 dark:bg-foreground/80',
				destructive:
					'border red-angled-rectangle-gradient border-brand-coral/20 bg-brand-coral/10 text-brand-coral focus-visible:ring-brand-coral/20 [a&]:hover:bg-brand-coral/15 dark:border-brand-coral/30 dark:bg-brand-coral/20 dark:text-[#D4658A]',
				outline:
					'border border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
			},
		},
		defaultVariants: {
			variant: 'default',
		},
	}
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<'span'> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : 'span';

	return (
		<Comp
			className={cn(badgeVariants({ variant }), className)}
			data-slot="badge"
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
