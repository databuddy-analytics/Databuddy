'use client';

import type React from 'react';
import { formatMetricNumber } from '@/lib/formatters';

interface FormattedNumberProps {
	id?: string;
	value: number;
	className?: string;
}

export const FormattedNumber: React.FC<FormattedNumberProps> = ({
	id,
	value,
	className,
}) => {
	return (
		<span className={className} id={id}>
			{formatMetricNumber(value)}
		</span>
	);
};

export default FormattedNumber;
