"use client";

import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Line,
	LineChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const chartConfig = {
	value: {
		label: "Value",
		color: "var(--color-primary)",
	},
} satisfies ChartConfig;

const previewData = [
	{ date: "Mon", value: 186 },
	{ date: "Tue", value: 305 },
	{ date: "Wed", value: 237 },
	{ date: "Thu", value: 73 },
	{ date: "Fri", value: 209 },
	{ date: "Sat", value: 214 },
];

const ChartPreview = ({
	chartType,
	className,
	size = 150,
}: {
	chartType: "bar" | "line" | "area" | "composed";
	className?: string;
	size?: number;
}) => {
	const chartId = `chart-preview-${chartType}`;
	const chartHeight = size - 16; // Account for padding

	return (
		<Card
			className={cn(
				"dotted-bg flex items-center justify-center overflow-hidden bg-accent p-0",
				className
			)}
			style={{ width: `${size}px`, height: `${size}px` }}
		>
			<CardContent className="flex size-full items-center justify-center p-2">
				<ChartContainer className="size-full" config={chartConfig}>
					<ResponsiveContainer height={chartHeight} width="100%">
						{(() => {
							switch (chartType) {
								case "bar":
									return (
										<BarChart
											data={previewData}
											margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
										>
											<defs>
												<linearGradient
													id={`gradient-${chartId}`}
													x1="0"
													x2="0"
													y1="0"
													y2="1"
												>
													<stop
														offset="0%"
														stopColor="var(--color-primary)"
														stopOpacity={0.4}
													/>
													<stop
														offset="100%"
														stopColor="var(--color-primary)"
														stopOpacity={0}
													/>
												</linearGradient>
											</defs>
											<XAxis dataKey="date" hide />
											<YAxis domain={["dataMin", "dataMax"]} hide />
											<Bar
												dataKey="value"
												fill={`url(#gradient-${chartId})`}
												radius={[2, 2, 0, 0]}
											/>
										</BarChart>
									);
								case "line":
									return (
										<LineChart
											data={previewData}
											margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
										>
											<XAxis dataKey="date" hide />
											<YAxis domain={["dataMin", "dataMax"]} hide />
											<Line
												dataKey="value"
												dot={false}
												stroke="var(--color-primary)"
												strokeWidth={1.5}
												type="monotone"
											/>
										</LineChart>
									);
								case "area":
									return (
										<AreaChart
											data={previewData}
											margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
										>
											<defs>
												<linearGradient
													id={`gradient-${chartId}`}
													x1="0"
													x2="0"
													y1="0"
													y2="1"
												>
													<stop
														offset="0%"
														stopColor="var(--color-primary)"
														stopOpacity={0.4}
													/>
													<stop
														offset="100%"
														stopColor="var(--color-primary)"
														stopOpacity={0}
													/>
												</linearGradient>
											</defs>
											<XAxis dataKey="date" hide />
											<YAxis domain={["dataMin", "dataMax"]} hide />
											<Area
												activeDot={{
													r: 2.5,
													fill: "var(--color-primary)",
													stroke: "var(--color-background)",
													strokeWidth: 1.5,
												}}
												dataKey="value"
												dot={false}
												fill={`url(#gradient-${chartId})`}
												stroke="var(--color-primary)"
												strokeWidth={1.5}
												type="monotone"
											/>
										</AreaChart>
									);
								default:
									return (
										<BarChart
											data={previewData}
											margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
										>
											<XAxis dataKey="date" hide />
											<YAxis domain={["dataMin", "dataMax"]} hide />
											<Bar
												dataKey="value"
												fill="var(--color-primary)"
												radius={[2, 2, 0, 0]}
											/>
										</BarChart>
									);
							}
						})()}
					</ResponsiveContainer>
				</ChartContainer>
			</CardContent>
		</Card>
	);
};

export default ChartPreview;
