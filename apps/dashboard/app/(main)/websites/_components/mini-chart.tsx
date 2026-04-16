"use client";

import {
	Chart,
	type ChartCurveType,
	type ChartSeriesKind,
} from "@/components/ui/composables/chart";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import dayjs from "@/lib/dayjs";
import { formatNumber } from "@/lib/formatters";

interface MiniChartProps {
	data: { date: string; value: number }[];
	days?: number;
	id: string;
}

export default function MiniChart({ data, id, days = 7 }: MiniChartProps) {
	const { chartType, chartStepType } = useChartPreferences("website-list");

	const seriesKind: ChartSeriesKind =
		chartType === "bar" ? "bar" : chartType === "line" ? "line" : "area";

	return (
		<div
			aria-label={`Mini chart showing views for the last ${days} days`}
			className="chart-container rounded"
			role="img"
		>
			<Chart.SingleSeries
				color="var(--chart-color)"
				curveType={chartStepType as ChartCurveType}
				data={data}
				dataKey="value"
				height={112}
				id={`${id}-${days}`}
				margin={{ top: 5, right: 0, left: 0, bottom: 0 }}
				seriesKind={seriesKind}
				tooltip={{
					formatLabelAction: (label) => dayjs(label).format("ddd, MMM D"),
					formatValue: formatNumber,
					valueSuffixLabel: "views",
				}}
				yDomain={["dataMin - 5", "dataMax + 5"]}
			/>
		</div>
	);
}
