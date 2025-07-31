'use client';

import { CreditCardIcon, CurrencyDollarIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
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
import { SkeletonChart } from '@/components/charts/skeleton-chart';
import { formatCurrency } from '@/lib/formatters';
import { cn } from '@/lib/utils';

// Enhanced color palette with gradients
const REVENUE_COLORS = {
	revenue: {
		primary: '#10b981',
		secondary: '#059669',
		light: '#d1fae5',
		gradient: 'from-emerald-500/20 to-emerald-600/5',
	},
	transactions: {
		primary: '#3b82f6',
		secondary: '#1d4ed8',
		light: '#dbeafe',
		gradient: 'from-blue-500/20 to-blue-600/5',
	},
};

// Enhanced tooltip with glass morphism effect
const CustomTooltip = ({ active, payload, label }: any) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	const getMetricIcon = (name: string) => {
		if (name.toLowerCase().includes('revenue')) {
			return <CurrencyDollarIcon className="h-3 w-3" />;
		}
		if (name.toLowerCase().includes('transaction')) {
			return <CreditCardIcon className="h-3 w-3" />;
		}
		return <CurrencyDollarIcon className="h-3 w-3" />;
	};

	return (
		<div className="min-w-[200px] rounded-xl border border-border/50 bg-card p-4 shadow-2xl backdrop-blur-md">
			<div className="mb-3 flex items-center gap-2 border-border/30 border-b pb-2">
				<div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
				<p className="font-semibold text-foreground text-sm">{label}</p>
			</div>
			<div className="space-y-2.5">
				{payload.map((entry: any, _index: number) => {
					let displayValue: string;
					if (entry.name.toLowerCase().includes('revenue')) {
						displayValue = formatCurrency(entry.value);
					} else {
						displayValue = entry.value.toLocaleString();
					}

					return (
						<div
							className="group flex items-center justify-between gap-3"
							key={`item-${entry.name}`}
						>
							<div className="flex items-center gap-2.5">
								<div
									className="h-3 w-3 rounded-full shadow-sm ring-2 ring-background"
									style={{ backgroundColor: entry.color }}
								/>
								<div className="flex items-center gap-1.5">
									{getMetricIcon(entry.name)}
									<span className="font-medium text-muted-foreground text-xs">
										{entry.name}
									</span>
								</div>
							</div>
							<span className="font-bold text-foreground text-sm transition-colors group-hover:text-primary">
								{displayValue}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};

interface RevenueChartProps {
	data:
		| Array<{
				date: string;
				revenue: number;
				transactions: number;
		  }>
		| undefined;
	isLoading: boolean;
	height?: number;
	className?: string;
}

export function RevenueChart({
	data,
	isLoading,
	height = 400,
	className,
}: RevenueChartProps) {
	const chartData = useMemo(() => data || [], [data]);
	const [hoveredMetric, setHoveredMetric] = useState<string | null>(null);

	const valueFormatter = (value: number): string => {
		if (value >= 1_000_000) {
			return `$${(value / 1_000_000).toFixed(1)}M`;
		}
		if (value >= 1000) {
			return `$${(value / 1000).toFixed(1)}k`;
		}
		return `$${value}`;
	};

	if (isLoading) {
		return <SkeletonChart className="w-full" height={height} />;
	}

	if (!chartData.length) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<div className="relative">
						<CurrencyDollarIcon className="mx-auto h-16 w-16 text-muted-foreground/20" />
						<div className="absolute inset-0 rounded-full bg-gradient-to-t from-primary/10 to-transparent blur-xl" />
					</div>
					<p className="mt-6 font-semibold text-foreground text-lg">
						No revenue data available
					</p>
					<p className="mx-auto mt-2 max-w-sm text-muted-foreground text-sm">
						Revenue data will appear here as transactions are processed
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={cn('w-full', className)}>
			<div className="relative" style={{ width: '100%', height: height + 20 }}>
				{/* Background gradient overlay */}
				<div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-muted/5" />

				<ResponsiveContainer height="100%" width="100%">
					<AreaChart
						data={chartData}
						margin={{
							top: 20,
							right: 30,
							left: 20,
							bottom: chartData.length > 5 ? 60 : 20,
						}}
					>
						<defs>
							{Object.entries(REVENUE_COLORS).map(([key, colors]) => (
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

							{/* Glow effects */}
							{Object.entries(REVENUE_COLORS).map(([key, _colors]) => (
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
							className="animate-pulse"
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

						<YAxis
							axisLine={false}
							tick={{
								fontSize: 11,
								fill: 'var(--muted-foreground)',
								fontWeight: 500,
							}}
							tickFormatter={valueFormatter}
							tickLine={false}
							width={60}
							yAxisId="left"
						/>

						<YAxis
							axisLine={false}
							orientation="right"
							tick={{
								fontSize: 11,
								fill: 'var(--muted-foreground)',
								fontWeight: 500,
							}}
							tickFormatter={(value) => value.toLocaleString()}
							tickLine={false}
							width={45}
							yAxisId="right"
						/>

						<Tooltip
							animationDuration={200}
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
							formatter={(value, _entry: any) => (
								<span
									className={cn(
										'cursor-pointer font-medium text-xs transition-all duration-200',
										hoveredMetric === value
											? 'text-primary'
											: 'text-muted-foreground hover:text-foreground'
									)}
									onMouseEnter={() => setHoveredMetric(value)}
									onMouseLeave={() => setHoveredMetric(null)}
								>
									{value.charAt(0).toUpperCase() + value.slice(1)}
								</span>
							)}
							iconSize={10}
							iconType="circle"
							wrapperStyle={{
								fontSize: '12px',
								paddingTop: '20px',
								bottom: chartData.length > 5 ? 35 : 5,
								fontWeight: 500,
							}}
						/>

						<Area
							activeDot={{
								r: 6,
								strokeWidth: 3,
								stroke: REVENUE_COLORS.revenue.primary,
								fill: 'var(--background)',
								filter: 'url(#glow-revenue)',
							}}
							className="transition-all duration-300"
							dataKey="revenue"
							dot={{ r: 0 }}
							fill="url(#gradient-revenue)"
							fillOpacity={1}
							name="Revenue"
							stroke={REVENUE_COLORS.revenue.primary}
							strokeWidth={2.5}
							type="monotone"
							yAxisId="left"
						/>

						<Area
							activeDot={{
								r: 6,
								strokeWidth: 3,
								stroke: REVENUE_COLORS.transactions.primary,
								fill: 'var(--background)',
								filter: 'url(#glow-transactions)',
							}}
							className="transition-all duration-300"
							dataKey="transactions"
							dot={{ r: 0 }}
							fill="url(#gradient-transactions)"
							fillOpacity={1}
							name="Transactions"
							stroke={REVENUE_COLORS.transactions.primary}
							strokeWidth={2.5}
							type="monotone"
							yAxisId="right"
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
