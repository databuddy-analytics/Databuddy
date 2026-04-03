"use client";

import type React from "react";
import { formatMetricNumber } from "@/lib/formatters";

interface FormattedNumberProps {
	className?: string;
	id?: string;
	value: number;
}

export const FormattedNumber: React.FC<FormattedNumberProps> = ({
	id,
	value,
	className,
}) => (
	<span className={className} id={id}>
		{formatMetricNumber(value)}
	</span>
);

export default FormattedNumber;
