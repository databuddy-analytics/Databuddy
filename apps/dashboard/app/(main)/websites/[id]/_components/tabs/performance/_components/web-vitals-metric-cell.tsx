"use client";

import { CheckCircle, Warning } from "@phosphor-icons/react";
import { formatPerformanceTime } from "../_utils/performance-utils";

type WebVitalsMetricCellProps = {
	value?: number;
	metric: "lcp" | "fcp" | "fid" | "inp" | "cls";
};

const getWebVitalsThresholds = (metric: string) => {
	switch (metric) {
		case "lcp":
			return { good: 2500, poor: 4000 };
		case "fcp":
			return { good: 1800, poor: 3000 };
		case "fid":
			return { good: 100, poor: 300 };
		case "inp":
			return { good: 200, poor: 500 };
		case "cls":
			return { good: 0.1, poor: 0.25 };
		default:
			return { good: 0, poor: 0 };
	}
};

const getMetricStyles = (value: number, metric: string) => {
	const thresholds = getWebVitalsThresholds(metric);

	if (value <= thresholds.good) {
		return {
			colorClass: "text-green-600",
			isGood: true,
			isPoor: false,
		};
	}

	if (value <= thresholds.poor) {
		return {
			colorClass: "text-yellow-600",
			isGood: false,
			isPoor: false,
		};
	}

	return {
		colorClass: "text-red-600",
		isGood: false,
		isPoor: true,
	};
};

export function WebVitalsMetricCell({
	value,
	metric,
}: WebVitalsMetricCellProps) {
	if (!value || value === 0) {
		return <span className="text-muted-foreground">N/A</span>;
	}

	const formatted =
		metric === "cls" ? value.toFixed(3) : formatPerformanceTime(value);
	const { colorClass, isGood, isPoor } = getMetricStyles(value, metric);
	const showIcon = isGood || isPoor;

	return (
		<div className="flex items-center gap-1">
			<span className={colorClass}>{formatted}</span>
			{showIcon && isGood && <CheckCircle className="size-3 text-green-600" />}
			{showIcon && isPoor && <Warning className="size-3 text-red-600" />}
		</div>
	);
}
