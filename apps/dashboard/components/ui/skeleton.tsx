import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('animate-pulse rounded-md bg-accent-brighter', className)}
			data-slot="skeleton"
			{...props}
		/>
	);
}

export { Skeleton };
