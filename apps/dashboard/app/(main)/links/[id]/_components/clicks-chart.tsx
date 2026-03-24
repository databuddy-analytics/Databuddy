"use client";

import { ChartLineIcon } from "@phosphor-icons/react/dist/ssr/ChartLine";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { ChartErrorBoundary } from "@/components/chart-error-boundary";
import dayjs from "@/lib/dayjs";
import { formatMetricNumber } from "@/lib/formatters";

export interface ChartDataPoint {
	date: string;
	clicks: number;
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
						<ChartLineIcon
							className="size-6 text-foreground"
							weight="duotone"
						/>
					</div>
					<p className="mt-6 font-medium text-foreground text-lg text-balance">
						No click data available
					</p>
					<p className="mx-auto max-w-sm text-muted-foreground text-sm text-pretty">
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
			<ChartErrorBoundary fallbackClassName="size-full">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart
						data={data}
						margin={{ top: 20, right: 20, left: 10, bottom: 20 }}
					>
						<defs>
							<linearGradient id="clicksGradient" x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="0%"
									stopColor="var(--color-chart-1)"
									stopOpacity={0.3}
								/>
								<stop
									offset="100%"
									stopColor="var(--color-chart-1)"
									stopOpacity={0.02}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid
							stroke="var(--sidebar-border)"
							strokeDasharray="2 4"
							strokeOpacity={0.3}
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="date"
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickFormatter={(value) => dayjs(value).format(xAxisFormat)}
							tickLine={false}
						/>
						<YAxis
							allowDecimals={false}
							axisLine={false}
							tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
							tickLine={false}
							width={45}
						/>
						<Tooltip
							content={({ active, payload, label }) =>
								active &&
								payload?.[0] &&
								typeof payload[0].value === "number" ? (
									<div className="min-w-[160px] rounded border bg-popover p-3 shadow-lg">
										<div className="mb-2 flex items-center gap-2 border-b pb-2">
											<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-chart-1" />
											<p className="font-medium text-foreground text-xs">
												{dayjs(label).format(tooltipFormat)}
											</p>
										</div>
										<div className="flex items-center justify-between gap-3">
											<div className="flex items-center gap-2">
												<div
													className="size-2.5 rounded-full"
													style={{ backgroundColor: "var(--color-chart-1)" }}
												/>
												<span className="text-muted-foreground text-xs">
													Clicks
												</span>
											</div>
											<span className="font-semibold text-foreground text-sm tabular-nums">
												{formatMetricNumber(payload[0].value)}
											</span>
										</div>
									</div>
								) : null
							}
							cursor={{
								stroke: "var(--color-chart-1)",
								strokeDasharray: "4 4",
								strokeOpacity: 0.5,
							}}
						/>
						<Area
							activeDot={{
								r: 4,
								fill: "var(--color-chart-1)",
								stroke: "var(--color-background)",
								strokeWidth: 2,
							}}
							dataKey="clicks"
							dot={false}
							fill="url(#clicksGradient)"
							stroke="var(--color-chart-1)"
							strokeWidth={2.5}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
			</ChartErrorBoundary>
		</div>
	);
}
