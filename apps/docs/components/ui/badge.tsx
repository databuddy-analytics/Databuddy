import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
	'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3',
	{
		variants: {
	variant: {
				default:
					'badge-angled-rectangle-gradient border border-primary-foreground/20 bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
				gray: 
				'bg-secondary border border-accent-foreground/30 badge-angled-rectangle-gradient text-accent-foreground',
				amber:
					'amber-angled-rectangle-gradient border border-amber-200 bg-amber-100 text-amber-800 [a&]:hover:bg-amber-200/90',
			secondary:
					'border border-accent-foreground/20 dark-angled-rectangle-gradient bg-accent-foreground text-accent [a&]:hover:bg-secondary/90',
				destructive:
					'border dark:border-red-500 border-red-800 bg-red-700 red-angled-rectangle-gradient text-white focus-visible:ring-destructive/20 dark:bg-red-900 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
				outline:
					'border border-foreground/20 text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
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
