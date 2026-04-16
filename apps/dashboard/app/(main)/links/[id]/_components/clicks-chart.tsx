"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
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
}

export function ClicksChart({
	data,
	height = 350,
	isHourly = false,
}: ClicksChartProps) {
	if (data.length === 0) {
		return (
			<div
				className="flex items-center justify-center"
				style={{ height: `${height}px` }}
			>
				<div className="flex flex-col items-center py-12 text-center">
					<div className="relative flex size-12 items-center justify-center rounded bg-accent">
						<ChartLineIcon className="size-6" weight="duotone" />
					</div>
					<p className="mt-6 text-balance font-medium text-foreground text-lg">
						No click data available
					</p>
					<p className="mx-auto max-w-sm text-pretty text-muted-foreground text-sm">
						Click data will appear here as visitors interact with your link
					</p>
				</div>
			</div>
		);
	}

	const xAxisFormat = isHourly ? "MMM D, HH:mm" : "MMM D";
	const tooltipFormat = isHourly ? "MMM D, YYYY HH:mm" : "MMM D, YYYY";

	return (
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
	);
}
