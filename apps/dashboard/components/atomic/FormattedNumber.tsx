"use client";

import type React from "react";
import { formatNumber } from "@/lib/formatters";

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
		{formatNumber(value)}
	</span>
);

export default FormattedNumber;
