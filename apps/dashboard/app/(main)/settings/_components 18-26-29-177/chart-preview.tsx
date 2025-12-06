"use client";

import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	Line,
	LineChart,
	Pie,
	PieChart,
	RadialBar,
	RadialBarChart,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

const chartConfig = {
	desktop: {
		label: "Desktop",
		color: "var(--chart-1)",
	},
	mobile: {
		label: "Mobile",
		color: "var(--chart-2)",
	},
} satisfies ChartConfig;

const previewData = [
	{ desktop: 186, mobile: 80 },
	{ desktop: 305, mobile: 200 },
	{ desktop: 237, mobile: 120 },
	{ desktop: 73, mobile: 190 },
	{ desktop: 209, mobile: 130 },
	{ desktop: 214, mobile: 140 },
];

const ChartPreview = ({
	chartType,
	className,
	size = 150,
}: {
	chartType: "bar" | "line" | "area" | "pie" | "radar" | "radial";
	className?: string;
	size?: number;
}) => {
	// Scale radii based on size (using 150 as the base)
	const scale = size / 150;
	const pieInnerRadius = Math.round(20 * scale);
	const pieOuterRadius = Math.round(40 * scale);
	const radialInnerRadius = Math.round(25 * scale);
	const radialOuterRadius = Math.round(45 * scale);

	return (
		<Card
			className={cn(
				"dotted-bg flex items-center justify-center p-0",
				className
			)}
			style={{ width: `${size}px`, height: `${size}px` }}
		>
			<CardContent className="flex size-full items-center justify-center p-2">
				<ChartContainer className="size-full" config={chartConfig}>
					{(() => {
						switch (chartType) {
							case "bar":
								return (
									<BarChart accessibilityLayer data={previewData}>
										<Bar
											dataKey="mobile"
											fill="var(--color-mobile)"
											radius={2}
										/>
									</BarChart>
								);
							case "line":
								return (
									<LineChart accessibilityLayer data={previewData}>
										<Line
											dataKey="desktop"
											dot={false}
											stroke="var(--color-desktop)"
											strokeWidth={2}
											type="natural"
										/>
									</LineChart>
								);
							case "area":
								return (
									<AreaChart accessibilityLayer data={previewData}>
										<Area
											dataKey="desktop"
											fill="var(--color-desktop)"
											fillOpacity={0.2}
											stroke="var(--color-desktop)"
											type="natural"
										/>
									</AreaChart>
								);
							case "pie":
								return (
									<PieChart>
										<Pie
											data={previewData.slice(0, 4)}
											dataKey="desktop"
											fill="var(--color-desktop)"
											innerRadius={pieInnerRadius}
											outerRadius={pieOuterRadius}
											paddingAngle={2}
										/>
									</PieChart>
								);
							case "radial":
								return (
									<RadialBarChart
										data={[
											{ value: 75, fill: "var(--color-desktop)" },
											{ value: 25, fill: "var(--color-mobile)" },
											{ value: 50, fill: "var(--color-chart-1)" },
										]}
										endAngle={-270}
										innerRadius={radialInnerRadius}
										outerRadius={radialOuterRadius}
										startAngle={90}
									>
										<RadialBar background cornerRadius={10} dataKey="value" />
									</RadialBarChart>
								);
							default:
								return (
									<BarChart accessibilityLayer data={previewData}>
										<Bar
											dataKey="mobile"
											fill="var(--color-mobile)"
											radius={3}
										/>
									</BarChart>
								);
						}
					})()}
				</ChartContainer>
			</CardContent>
		</Card>
	);
};

export default ChartPreview;
