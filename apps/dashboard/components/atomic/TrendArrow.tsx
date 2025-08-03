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
		colorClass = invertColor
			? 'text-red-600 dark:text-red-400'
			: 'text-green-600 dark:text-green-400';
	}
	if (value < 0) {
		colorClass = invertColor
			? 'text-green-600 dark:text-green-400'
			: 'text-red-600 dark:text-red-400';
	}

	return (
		<span className={cn(colorClass, className)} id={id}>
			{arrow}
		</span>
	);
};

export default TrendArrow;
