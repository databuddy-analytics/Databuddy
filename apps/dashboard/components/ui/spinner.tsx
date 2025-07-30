'use client';

import { CircleNotch } from '@phosphor-icons/react';
import { cn } from '../../lib/utils';

export const Spinner = ({ className }: { className?: string }) => {
	return (
		<CircleNotch
			className={cn('animate-spin text-muted-foreground', className)}
		/>
	);
};
