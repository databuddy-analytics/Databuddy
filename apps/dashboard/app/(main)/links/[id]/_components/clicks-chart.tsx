"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ds/empty-state";
import { Chart } from "@/components/ui/composables/chart";
import dayjs from "@/lib/dayjs";

export interface ChartDataPoint {
	clicks: number;
	date: string;
	[key: string]: string | number;
}

interface ClicksChartProps {
	data: ChartDataPoint[];
	height?: number;
	isHourly?: boolean;
	isLoading?: boolean;
}

export function ClicksChart({
	data,
	height = 350,
	isHourly = false,
	isLoading = false,
}: ClicksChartProps) {
	if (isLoading) {
		return (
			<Chart>
				<Chart.Plot>
					<div style={{ height: `${height}px` }}>
						<Chart.DefaultLoading />
					</div>
				</Chart.Plot>
			</Chart>
		);
	}

	if (data.length === 0) {
		return (
			<Chart>
				<Chart.Plot>
					<div
						className="flex items-center justify-center"
						style={{ height: `${height}px` }}
					>
						<EmptyState
							description="Click data will appear here as visitors interact with your link"
							icon={<ChartLineIcon className="size-6" weight="duotone" />}
							title="No click data available"
						/>
					</div>
				</Chart.Plot>
			</Chart>
		);
	}

	const xAxisFormat = isHourly ? "MMM D, HH:mm" : "MMM D";
	const tooltipFormat = isHourly ? "MMM D, YYYY HH:mm" : "MMM D, YYYY";

	return (
		<Chart>
			<Chart.Plot>
				<div style={{ height: `${height}px`, width: "100%" }}>
					<Chart.CartesianArea
						data={data}
						dataKey="clicks"
						formatTooltipLabel={(label) => dayjs(label).format(tooltipFormat)}
						height={height}
						id="link-clicks"
						valueLabel="Clicks"
						xTickFormatter={(value) => dayjs(value).format(xAxisFormat)}
					/>
				</div>
			</Chart.Plot>
		</Chart>
	);
}
