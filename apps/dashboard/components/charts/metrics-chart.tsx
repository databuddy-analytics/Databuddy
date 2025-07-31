import { LineChart } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
	Area,
	AreaChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type ChartDataRow, METRIC_COLORS, METRICS } from './metrics-constants';
import { SkeletonChart } from './skeleton-chart';

const CustomTooltip = ({
	active,
	payload,
	label,
}: {
	active?: boolean;
	payload?: Array<{
		name: string;
		value: number;
		color: string;
		payload: ChartDataRow;
	}>;
	label?: string;
}) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	return (
		<div className="min-w-[200px] rounded-xl border border-border/50 bg-card p-4 shadow-2xl backdrop-blur-md">
			<div className="mb-3 flex items-center gap-2 border-border/30 border-b pb-2">
				<div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
				<p className="font-semibold text-foreground text-sm">{label}</p>
			</div>
			<div className="space-y-2.5">
				{payload.map((entry) => {
					const dataPoint = entry.payload;
					const metric = METRICS.find(
						(m) => m.label === entry.name || m.key === entry.name
					);
					if (!metric) {
						return null;
					}

					const Icon = metric.icon;
					const displayValue = metric.formatValue
						? metric.formatValue(entry.value, dataPoint)
						: entry.value.toLocaleString();

					return (
						<div
							className="group flex items-center justify-between gap-3"
							key={`item-${metric.key}`}
						>
							<div className="flex items-center gap-2.5">
								<div
									className="h-3 w-3 rounded-full shadow-sm ring-2 ring-background"
									style={{ backgroundColor: entry.color }}
								/>
								<div className="flex items-center gap-1.5">
									<Icon className="h-3 w-3" />
									<span className="font-medium text-muted-foreground text-xs">
										{metric.label}
									</span>
								</div>
							</div>
							<span className="font-bold text-foreground text-sm group-hover:text-primary">
								{displayValue}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};

interface MetricsChartProps {
	data: ChartDataRow[] | undefined;
	isLoading: boolean;
	height?: number;
	title?: string;
	description?: string;
	className?: string;
}

export function MetricsChart({
	data,
	isLoading,
	height = 550,
	title,
	description,
	className,
}: MetricsChartProps) {
	const chartData = useMemo(() => data || [], [data]);
	const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

	const valueFormatter = useCallback((value: number): string => {
		if (value >= 1_000_000) {
			return `${(value / 1_000_000).toFixed(1)}M`;
		}
		if (value >= 1000) {
			return `${(value / 1000).toFixed(1)}k`;
		}
		return value.toString();
	}, []);

	const yAxisConfig = {
		yAxisId: 'left',
		axisLine: false,
		tick: { fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 },
		tickFormatter: valueFormatter,
		tickLine: false,
		width: 45,
		hide: false,
	};

	if (isLoading) {
		return <SkeletonChart className="w-full" height={height} title={title} />;
	}

	if (!chartData.length) {
		return (
			<Card
				className={cn(
					'w-full border-0 bg-gradient-to-br from-background to-muted/20 shadow-lg',
					className
				)}
			>
				<CardHeader className="px-6 py-6">
					<CardTitle className="flex items-center gap-2 font-semibold text-lg">
						<LineChart className="h-5 w-5 text-primary" />
						{title}
					</CardTitle>
					{description && (
						<CardDescription className="text-sm">{description}</CardDescription>
					)}
				</CardHeader>
				<CardContent className="flex items-center justify-center p-8">
					<div className="py-12 text-center">
						<div className="relative">
							<LineChart
								className="mx-auto h-16 w-16 text-muted-foreground/20"
								strokeWidth={1.5}
							/>
							<div className="absolute inset-0 rounded-full bg-gradient-to-t from-primary/10 to-transparent blur-xl" />
						</div>
						<p className="mt-6 font-semibold text-foreground text-lg">
							No data available
						</p>
						<p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm">
							Your analytics data will appear here as visitors interact with
							your website
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	const presentMetrics = METRICS.filter((metric) =>
		chartData.some(
			(item) => metric.key in item && item[metric.key] !== undefined
		)
	);

	return (
		<Card
			className={cn(
				'w-full overflow-hidden border-0 bg-gradient-to-br from-background via-background to-muted/10 shadow-lg',
				className
			)}
		>
			<CardContent className="p-0">
				<div
					className="relative"
					style={{ width: '100%', height: height + 20 }}
				>
					<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-muted/5" />

					<ResponsiveContainer height="100%" width="100%">
						<AreaChart
							data={chartData}
							margin={{
								top: 30,
								right: 30,
								left: 20,
								bottom: chartData.length > 5 ? 60 : 20,
							}}
						>
							<defs>
								{Object.entries(METRIC_COLORS).map(([key, colors]) => (
									<linearGradient
										id={`gradient-${key}`}
										key={key}
										x1="0"
										x2="0"
										y1="0"
										y2="1"
									>
										<stop
											offset="0%"
											stopColor={colors.primary}
											stopOpacity={0.3}
										/>
										<stop
											offset="50%"
											stopColor={colors.primary}
											stopOpacity={0.1}
										/>
										<stop
											offset="100%"
											stopColor={colors.primary}
											stopOpacity={0.02}
										/>
									</linearGradient>
								))}
								{Object.entries(METRIC_COLORS).map(([key]) => (
									<filter id={`glow-${key}`} key={`glow-${key}`}>
										<feGaussianBlur result="coloredBlur" stdDeviation="3" />
										<feMerge>
											<feMergeNode in="coloredBlur" />
											<feMergeNode in="SourceGraphic" />
										</feMerge>
									</filter>
								))}
							</defs>
							<CartesianGrid
								stroke="var(--border)"
								strokeDasharray="2 4"
								strokeOpacity={0.3}
								vertical={false}
							/>
							<XAxis
								axisLine={{ stroke: 'var(--border)', strokeOpacity: 0.5 }}
								dataKey="date"
								dy={10}
								tick={{
									fontSize: 11,
									fill: 'var(--muted-foreground)',
									fontWeight: 500,
								}}
								tickLine={false}
							/>
							<YAxis {...yAxisConfig} />
							<Tooltip
								content={<CustomTooltip />}
								cursor={{
									stroke: 'var(--primary)',
									strokeWidth: 1,
									strokeOpacity: 0.5,
									strokeDasharray: '4 4',
								}}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Legend
								formatter={(value) => (
									<span
										className={cn(
											'cursor-pointer font-medium text-xs',
											hoveredMetric === value
												? 'text-primary'
												: 'text-muted-foreground hover:text-foreground'
										)}
										onMouseEnter={() => setHoveredMetric(value)}
										onMouseLeave={() => setHoveredMetric(null)}
									>
										{value.charAt(0).toUpperCase() +
											value.slice(1).replace(/_/g, ' ')}
									</span>
								)}
								iconSize={10}
								iconType="circle"
								payload={presentMetrics.map((metric) => ({
									value: metric.label,
									type: 'circle',
									color: metric.color,
									id: metric.key,
								}))}
								wrapperStyle={{
									fontSize: '12px',
									paddingTop: '20px',
									bottom: chartData.length > 5 ? 35 : 5,
									fontWeight: 500,
								}}
							/>
							{METRICS.map((metric) => {
								const present = chartData.some(
									(item) => metric.key in item && item[metric.key] !== undefined
								);
								return (
									<Area
										activeDot={{
											r: 6,
											strokeWidth: 3,
											stroke: metric.color,
											fill: 'var(--background)',
											filter: `url(#glow-${metric.gradient})`,
										}}
										dataKey={metric.key}
										dot={{ r: 0 }}
										fill={`url(#gradient-${metric.gradient})`}
										fillOpacity={1}
										hide={!present}
										key={metric.key}
										name={metric.label}
										stroke={metric.color}
										strokeWidth={2.5}
										type="monotone"
										yAxisId={metric.yAxisId}
									/>
								);
							})}
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</CardContent>
		</Card>
	);
}
