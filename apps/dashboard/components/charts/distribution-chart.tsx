import { PieChartIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Sector,
	Tooltip,
} from 'recharts';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { SkeletonChart } from './skeleton-chart';

// Simple color palette
const COLORS = [
	'#3b82f6', // Blue
	'#10b981', // Green
	'#f59e0b', // Amber
	'#ef4444', // Red
	'#8b5cf6', // Purple
	'#ec4899', // Pink
];

interface ChartDataItem {
	name: string;
	value: number;
	color?: string;
}

interface DistributionChartProps {
	data: ChartDataItem[] | undefined;
	isLoading: boolean;
	title: string;
	description?: string;
	height?: number;
}

// Simple tooltip
const CustomTooltip = ({ active, payload }: any) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	const data = payload[0];
	return (
		<div className="rounded-md border border-border bg-background p-2 text-xs shadow-md">
			<p className="font-semibold">{data.name}</p>
			<p>
				<span className="text-muted-foreground">Count: </span>
				<span className="font-medium">{data.value.toLocaleString()}</span>
			</p>
			{data.payload.percent && (
				<p>
					<span className="text-muted-foreground">Percentage: </span>
					<span className="font-medium">
						{(data.payload.percent * 100).toFixed(1)}%
					</span>
				</p>
			)}
		</div>
	);
};

// Active shape renderer
const renderActiveShape = (props: any) => {
	const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } =
		props;

	return (
		<g>
			<Sector
				cx={cx}
				cy={cy}
				endAngle={endAngle}
				fill={fill}
				innerRadius={innerRadius}
				outerRadius={outerRadius + 3}
				startAngle={startAngle}
			/>
		</g>
	);
};

export function DistributionChart({
	data,
	isLoading,
	title,
	description,
	height = 190,
}: DistributionChartProps) {
	const [activeIndex, setActiveIndex] = useState<number>(-1);

	// Process chart data
	const chartData = useMemo(() => {
		if (!data || data.length === 0) {
			return [];
		}

		// Sort by value
		const sortedData = [...data].sort((a, b) => b.value - a.value);
		const total = sortedData.reduce((sum, item) => sum + item.value, 0);

		// Add colors and percentages
		return sortedData.map((item, index) => ({
			...item,
			color: item.color || COLORS[index % COLORS.length],
			percent: total > 0 ? item.value / total : 0,
		}));
	}, [data]);

	// Event handlers
	const onPieEnter = useCallback((_: unknown, index: number) => {
		setActiveIndex(index);
	}, []);

	const onPieLeave = useCallback(() => {
		setActiveIndex(-1);
	}, []);

	if (isLoading) {
		return <SkeletonChart height={height} title={title} />;
	}

	if (!chartData.length) {
		return (
			<Card className="w-full">
				<CardHeader className="px-4 py-3">
					<CardTitle className="font-medium text-sm">{title}</CardTitle>
					{description && (
						<CardDescription className="text-xs">{description}</CardDescription>
					)}
				</CardHeader>
				<CardContent className="flex items-center justify-center p-4">
					<div className="py-6 text-center">
						<PieChartIcon
							className="mx-auto h-8 w-8 text-muted-foreground/40"
							strokeWidth={1.5}
						/>
						<p className="mt-2 font-medium text-sm">No data available</p>
						<p className="mt-1 text-muted-foreground text-xs">
							Data will appear as it's collected
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="w-full">
			<CardHeader className="px-4 py-3">
				<CardTitle className="font-medium text-sm">{title}</CardTitle>
				{description && (
					<CardDescription className="text-xs">{description}</CardDescription>
				)}
			</CardHeader>
			<CardContent className="px-0 pt-0 pb-4">
				<div style={{ width: '100%', height: height - 50 }}>
					<ResponsiveContainer height="100%" width="100%">
						<PieChart>
							<Pie
								activeIndex={activeIndex}
								activeShape={renderActiveShape}
								cx="50%"
								cy="50%"
								data={chartData}
								dataKey="value"
								innerRadius={40}
								onMouseEnter={onPieEnter}
								onMouseLeave={onPieLeave}
								outerRadius={60}
								paddingAngle={2}
							>
								{chartData.map((entry) => (
									<Cell
										fill={entry.color}
										key={`cell-${entry.name}`}
										stroke="var(--background)"
										strokeWidth={1}
									/>
								))}
							</Pie>
							<Tooltip
								content={<CustomTooltip />}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Legend
								align="center"
								formatter={(value: string, entry: any) => {
									const item = entry.payload;
									const percentage = item.percent
										? ` (${(item.percent * 100).toFixed(0)}%)`
										: '';
									return (
										<span className="text-xs">
											{value}
											{percentage}
										</span>
									);
								}}
								layout="horizontal"
								verticalAlign="bottom"
								wrapperStyle={{ fontSize: '10px', bottom: 0 }}
							/>
						</PieChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
