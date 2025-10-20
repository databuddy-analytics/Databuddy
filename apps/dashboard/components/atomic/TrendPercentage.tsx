'use client';

import type React from 'react';
import { cn } from '@/lib/utils';

interface TrendPercentageProps {
	id?: string;
	value: number;
	invertColor?: boolean;
	className?: string;
	digits?: number;
}

const formatPercentage = (value: number, digits = 1): string => {
	const sign = value > 0 ? '+' : '';
	return `${sign}${Math.abs(value).toFixed(digits)}%`;
};

export const TrendPercentage: React.FC<TrendPercentageProps> = ({
	id,
	value,
	invertColor = false,
	className,
	digits = 1,
}) => {
	let colorClass = 'text-muted-foreground';

	if (Number.isNaN(value)) {
		return (
			<span className={cn('text-muted-foreground', className)} id={id}>
				--%
			</span>
		);
	}

	if (value > 0) {
		colorClass = invertColor ? 'text-destructive' : 'text-success';
	}
	if (value < 0) {
		colorClass = invertColor ? 'text-success' : 'text-destructive';
	}

	return (
		<span className={cn('font-medium', colorClass, className)} id={id}>
			{formatPercentage(value, digits)}
		</span>
	);
};

export default TrendPercentage;
