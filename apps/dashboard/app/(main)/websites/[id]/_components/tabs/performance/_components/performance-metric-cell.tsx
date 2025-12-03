"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import {
	formatPerformanceTime,
	getMetricStyles,
} from "../_utils/performance-utils";

type PerformanceMetricCellProps = {
	value?: number;
	type?: "time" | "cls";
};

export function PerformanceMetricCell({
	value,
	type = "time",
}: PerformanceMetricCellProps) {
	if (!value || value === 0) {
		return <span className="text-muted-foreground">N/A</span>;
	}

	const formatted =
		type === "cls" ? value.toFixed(3) : formatPerformanceTime(value);
	const { colorClass, isGood, isPoor } = getMetricStyles(value, type);
	const showIcon = isGood || isPoor;

	return (
		<div className="flex items-center gap-1">
			<span className={colorClass}>{formatted}</span>
			{showIcon && isGood && <CheckCircle className="size-3 text-green-600" />}
			{showIcon && isPoor && <Warning className="size-3 text-red-400" />}
		</div>
	);
}
