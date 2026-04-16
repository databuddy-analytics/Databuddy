"use client";

import { ChartBarIcon } from "@phosphor-icons/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { ChartPieIcon } from "@phosphor-icons/react";
import { WaveformIcon } from "@phosphor-icons/react";
import { StatCard } from "@/components/analytics/stat-card";
import { MiniPieChart } from "@/components/charts/pie-chart";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

function generateChartData(days: number, baseValue: number, variance: number) {
	const data: { date: string; value: number }[] = [];
	const now = new Date();

	for (let i = days - 1; i >= 0; i--) {
		const date = new Date(now);
		date.setDate(date.getDate() - i);
		const randomVariance = Math.random() * variance * 2 - variance;
		const trendBoost = ((days - i) / days) * (variance * 0.5);
		data.push({
			date: date.toISOString().split("T")[0],
			value: Math.max(0, Math.round(baseValue + randomVariance + trendBoost)),
		});
	}

	return data;
}

const areaData = generateChartData(14, 1200, 400);
const lineData = generateChartData(14, 3500, 800);
const barData = generateChartData(14, 800, 200);

const browserData = [
	{ name: "Chrome", value: 4500 },
	{ name: "Safari", value: 2100 },
	{ name: "Firefox", value: 890 },
	{ name: "Edge", value: 650 },
	{ name: "Other", value: 320 },
];

const deviceData = [
	{ name: "Desktop", value: 5200 },
	{ name: "Mobile", value: 3100 },
	{ name: "Tablet", value: 420 },
];

const trafficData = [
	{ name: "Direct", value: 3200 },
	{ name: "Organic", value: 2800 },
	{ name: "Referral", value: 1500 },
	{ name: "Social", value: 980 },
];

export default function ChartsPage() {
	return (
		<div className="container mx-auto max-w-7xl space-y-8 p-6">
			<div>
				<h1 className="text-balance font-bold text-3xl">Chart Types</h1>
				<p className="mt-2 text-pretty text-muted-foreground">
					Each column shows all variants for a chart type.
				</p>
			</div>

			<div className="grid gap-6 lg:grid-cols-4">
				<Card className="gap-4">
					<CardHeader>
						<div className="flex items-center gap-2">
							<WaveformIcon className="size-5" weight="duotone" />
							<CardTitle>Area Chart</CardTitle>
						</div>
						<CardDescription>Filled area under the line</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<StatCard
							chartData={areaData}
							chartStepType="monotone"
							chartType="area"
							displayMode="chart"
							id="area-chart"
							title="Monotone"
							trend={12.5}
							value={15_420}
						/>
						<StatCard
							chartData={areaData}
							chartStepType="linear"
							chartType="area"
							displayMode="chart"
							id="area-linear"
							title="Linear"
							trend={8.3}
							value={15_420}
						/>
						<StatCard
							chartData={areaData}
							chartStepType="step"
							chartType="area"
							displayMode="chart"
							id="area-step"
							title="Step"
							trend={-3.2}
							value={15_420}
						/>
						<StatCard
							chartData={areaData}
							chartStepType="stepBefore"
							chartType="area"
							displayMode="chart"
							id="area-step-before"
							title="Step Before"
							trend={5.1}
							value={15_420}
						/>
						<StatCard
							chartData={areaData}
							chartStepType="stepAfter"
							chartType="area"
							displayMode="chart"
							id="area-step-after"
							title="Step After"
							trend={2.8}
							value={15_420}
						/>
					</CardContent>
				</Card>

				<Card className="gap-4">
					<CardHeader>
						<div className="flex items-center gap-2">
							<ChartLineIcon className="size-5" weight="duotone" />
							<CardTitle>Line Chart</CardTitle>
						</div>
						<CardDescription>Simple line without fill</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<StatCard
							chartData={lineData}
							chartStepType="monotone"
							chartType="line"
							displayMode="chart"
							id="line-chart"
							title="Monotone"
							trend={12.5}
							value={45_200}
						/>
						<StatCard
							chartData={lineData}
							chartStepType="linear"
							chartType="line"
							displayMode="chart"
							id="line-linear"
							title="Linear"
							trend={8.3}
							value={45_200}
						/>
						<StatCard
							chartData={lineData}
							chartStepType="step"
							chartType="line"
							displayMode="chart"
							id="line-step"
							title="Step"
							trend={-3.2}
							value={45_200}
						/>
						<StatCard
							chartData={lineData}
							chartStepType="stepBefore"
							chartType="line"
							displayMode="chart"
							id="line-step-before"
							title="Step Before"
							trend={5.1}
							value={45_200}
						/>
						<StatCard
							chartData={lineData}
							chartStepType="stepAfter"
							chartType="line"
							displayMode="chart"
							id="line-step-after"
							title="Step After"
							trend={2.8}
							value={45_200}
						/>
					</CardContent>
				</Card>

				<Card className="gap-4">
					<CardHeader>
						<div className="flex items-center gap-2">
							<ChartBarIcon className="size-5" weight="duotone" />
							<CardTitle>Bar Chart</CardTitle>
						</div>
						<CardDescription>Vertical bars for each data point</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<StatCard
							chartData={barData}
							chartType="bar"
							displayMode="chart"
							id="bar-chart"
							title="Default"
							trend={12.5}
							value={9800}
						/>
						<StatCard
							chartData={barData}
							chartType="bar"
							displayMode="chart"
							id="bar-chart-2"
							title="Negative Trend"
							trend={-5.4}
							value={9800}
						/>
						<StatCard
							chartData={barData}
							chartType="bar"
							displayMode="chart"
							id="bar-chart-3"
							title="Neutral Trend"
							trend={0}
							value={9800}
						/>
						<StatCard
							chartData={barData}
							chartType="bar"
							displayMode="compact"
							id="bar-compact"
							title="Compact Mode"
							trend={7.2}
							value={9800}
						/>
						<StatCard
							chartData={barData}
							chartType="bar"
							displayMode="text"
							id="bar-text"
							title="Text Mode"
							value={9800}
						/>
					</CardContent>
				</Card>

				<Card className="gap-4">
					<CardHeader>
						<div className="flex items-center gap-2">
							<ChartPieIcon className="size-5" weight="duotone" />
							<CardTitle>Pie Chart</CardTitle>
						</div>
						<CardDescription>Distribution visualization</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<MiniPieChart
							data={browserData}
							id="pie-donut"
							title="Browsers"
							variant="donut"
						/>
						<MiniPieChart
							data={deviceData}
							id="pie-full"
							title="Devices"
							variant="pie"
						/>
						<MiniPieChart
							data={trafficData}
							id="pie-no-labels"
							showLabels={false}
							title="Traffic Sources"
							variant="donut"
						/>
						<MiniPieChart
							data={[]}
							id="pie-empty"
							title="No Data"
							variant="donut"
						/>
						<MiniPieChart
							data={browserData}
							id="pie-loading"
							isLoading
							title="Loading"
							variant="donut"
						/>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
