'use client';

import dayjs from 'dayjs';
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import type { Experiment } from '@/hooks/use-experiments';

interface ConversionChartProps {
	experiment: Experiment;
}

// Mock data generator
const generateTimeSeriesData = (startDate: Date, days: number) => {
	const data = [];
	for (let i = 0; i < days; i++) {
		const date = dayjs(startDate).add(i, 'day');
		// Simulate conversion rates with some variance
		const controlRate = 11.1 + (Math.random() - 0.5) * 2;
		const variantRate = 12.4 + (Math.random() - 0.5) * 2;

		data.push({
			date: date.format('MMM D'),
			control: Number(controlRate.toFixed(1)),
			variant: Number(variantRate.toFixed(1)),
		});
	}
	return data;
};

const CustomTooltip = ({ active, payload, label }: any) => {
	if (!(active && payload && payload.length)) return null;

	return (
		<div className="rounded border bg-card p-3 shadow-lg">
			<p className="font-medium text-sm">{label}</p>
			<div className="mt-2 space-y-1">
				{payload.map((entry: any, index: number) => (
					<div className="flex items-center gap-2 text-xs" key={index}>
						<div
							className="h-2 w-2 rounded-full"
							style={{ backgroundColor: entry.color }}
						/>
						<span className="capitalize">{entry.dataKey}:</span>
						<span className="font-medium">{entry.value}%</span>
					</div>
				))}
			</div>
		</div>
	);
};

export function ConversionChart({ experiment }: ConversionChartProps) {
	const days = dayjs().diff(dayjs(experiment.createdAt), 'days') || 1;
	const data = generateTimeSeriesData(
		new Date(experiment.createdAt),
		Math.min(days, 14)
	);

	return (
		<div className="rounded border bg-card shadow-sm">
			<div className="border-b p-4">
				<h2 className="font-semibold text-lg tracking-tight">
					Conversion Rates
				</h2>
				<p className="text-muted-foreground text-sm">
					Control vs variant performance over time
				</p>
			</div>
			<div className="p-4">
				<div className="h-64">
					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={data}
							margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
						>
							<defs>
								<linearGradient
									id="controlGradient"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor="hsl(var(--muted-foreground))"
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor="hsl(var(--muted-foreground))"
										stopOpacity={0.1}
									/>
								</linearGradient>
								<linearGradient
									id="variantGradient"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop
										offset="5%"
										stopColor="hsl(var(--primary))"
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor="hsl(var(--primary))"
										stopOpacity={0.1}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid
								stroke="hsl(var(--border))"
								strokeDasharray="3 3"
							/>
							<XAxis
								axisLine={false}
								dataKey="date"
								tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								domain={['dataMin - 1', 'dataMax + 1']}
								tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
								tickLine={false}
							/>
							<Tooltip content={<CustomTooltip />} />
							<Area
								dataKey="control"
								fill="url(#controlGradient)"
								fillOpacity={1}
								stroke="hsl(var(--muted-foreground))"
								strokeWidth={2}
								type="monotone"
							/>
							<Area
								dataKey="variant"
								fill="url(#variantGradient)"
								fillOpacity={1}
								stroke="hsl(var(--primary))"
								strokeWidth={2}
								type="monotone"
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
