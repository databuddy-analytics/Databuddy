"use client";

import { formatPerformanceTime } from "../_utils/performance-utils";
import {
	CheckCircleIcon as CheckCircle,
	WarningIcon as Warning,
} from "@databuddy/ui/icons";

interface WebVitalsMetricCellProps {
	metric: "lcp" | "fcp" | "fid" | "inp" | "cls";
	value?: number;
}

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

	return (
		<div className="flex items-center justify-end gap-1">
			{isGood ? (
				<CheckCircle
					aria-hidden="true"
					className="size-3.5 shrink-0 text-success"
				/>
			) : null}
			{isPoor ? (
				<Warning
					aria-hidden="true"
					className="size-3.5 shrink-0 text-destructive"
				/>
			) : null}
			<span className={colorClass}>{formatted}</span>
		</div>
	);
}
