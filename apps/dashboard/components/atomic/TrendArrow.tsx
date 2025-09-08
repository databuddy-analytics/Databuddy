'use client';

import type React from 'react';
import { cn } from '@/lib/utils';

interface TrendArrowProps {
	id?: string;
	value: number;
	invertColor?: boolean;
	className?: string;
}

export const TrendArrow: React.FC<TrendArrowProps> = ({
	id,
	value,
	invertColor = false,
	className,
}) => {
	const arrow = value > 0 ? '↑' : value < 0 ? '↓' : '→';
	let colorClass = 'text-muted-foreground'; // Default for zero

	if (value > 0) {
		colorClass = invertColor ? 'text-destructive' : 'text-success';
	}
	if (value < 0) {
		colorClass = invertColor ? 'text-success' : 'text-destructive';
	}

	return (
		<span className={cn(colorClass, className)} id={id}>
			{arrow}
		</span>
	);
};

export default TrendArrow;
