"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { useMemo } from "react";
import {
	Chart,
	type ChartCurveType,
	type ChartMultiSeriesDataPoint,
	type ChartSeriesKind,
	type MetricConfig,
} from "@/components/ui/composables/chart";
import { chartSeriesColorAtIndex } from "@/lib/chart-presentation";
import type { ChartQueryOutcome } from "@/lib/chart-query-outcome";
import { cn } from "@/lib/utils";

interface SimpleMetricsChartProps {
	chartStepType?: ChartCurveType;
	className?: string;
	data: ChartMultiSeriesDataPoint[];
	description?: string;
	height?: number;
	isLoading?: boolean;
	metrics: MetricConfig[];
	/** When true, the last segment (incomplete period) uses a dashed stroke, matching the overview traffic trends chart. Applies to area and line, not bar. */
	partialLastSegment?: boolean;
	/** Area (default), line, or grouped bar. */
	seriesKind?: ChartSeriesKind;
	title?: string;
}

interface SimpleChartReadyPayload {
	metrics: Array<MetricConfig & { color: string }>;
	points: ChartMultiSeriesDataPoint[];
}

export function SimpleMetricsChart({
	data,
	metrics,
	title,
	description,
	height = 140,
	isLoading = false,
	className,
	partialLastSegment = false,
	chartStepType = "monotone",
	seriesKind = "area",
}: SimpleMetricsChartProps) {
	const metricsWithColors = useMemo(
		() =>
			metrics.map((m, i) => ({
				...m,
				color: m.color || chartSeriesColorAtIndex(i),
			})),
		[metrics]
	);

	const outcome = useMemo((): ChartQueryOutcome<SimpleChartReadyPayload> => {
		if (isLoading) {
			return { status: "loading" };
		}
		if (data.length === 0) {
			return { status: "empty" };
		}
		return {
			status: "ready",
			data: { metrics: metricsWithColors, points: data },
		};
	}, [data, isLoading, metricsWithColors]);

	return (
		<Chart className={cn("py-0", className)}>
			<Chart.Content<SimpleChartReadyPayload>
				emptyProps={{
					description: "No samples in this range.",
					icon: <ChartLineIcon weight="duotone" />,
					title: "No data",
				}}
				loading={<Chart.DefaultLoading height={height} />}
				outcome={outcome}
			>
				{({ metrics: series, points }) => (
					<>
						<Chart.Plot>
							<Chart.MultiSeries
								curveType={chartStepType}
								data={points}
								height={height}
								metrics={series}
								partialLastSegment={partialLastSegment}
								seriesKind={seriesKind}
							/>
						</Chart.Plot>

						<Chart.Footer>
							<div className="min-w-0 flex-1">
								{title ? (
									<p className="truncate font-semibold text-sm leading-tight">
										{title}
									</p>
								) : null}
								{description ? (
									<p className="truncate text-muted-foreground text-xs">
										{description}
									</p>
								) : null}
							</div>
							<Chart.Legend metrics={series} />
						</Chart.Footer>
					</>
				)}
			</Chart.Content>
		</Chart>
	);
}
