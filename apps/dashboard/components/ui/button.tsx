import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center cursor-pointer gap-2 whitespace-nowrap rounded font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-accent-disabled disabled:text-neutral-500',
				destructive:
					'bg-destructive text-white disabled:bg-accent-disabled disabled:text-neutral-500  hover:bg-destructive-brighter focus-visible:ring-destructive/20',
				outline:
					'border text-accent-foreground bg-transparent hover:border-transparent disabled:bg-accent-disabled disabled:text-neutral-400  hover:bg-secondary hover:text-accent-foreground',
				secondary:
					'bg-secondary  text-accent-foreground hover:bg-secondary-brighter disabled:bg-accent-disabled disabled:text-neutral-500',
				ghost:
					'disabled:bg-accent-disabled/30 disabled:text-accent-foreground/20 hover:text-accent-foreground hover:bg-accent',
				link: 'text-primary underline-offset-4  hover:bg-primary/90 disabled:bg-accent-disabled disabled:text-neutral-500  hover:underline',
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 gap-1.5 rounded px-3 has-[>svg]:px-2.5',
				lg: 'h-10 rounded px-6 has-[>svg]:px-4',
				icon: 'size-9',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	}
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<'button'> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : 'button';

	return (
		<Comp
			className={cn(buttonVariants({ variant, size, className }))}
			data-slot="button"
			{...props}
		/>
	);
}

export { Button, buttonVariants };
