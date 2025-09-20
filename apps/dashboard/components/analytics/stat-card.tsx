import dayjs from 'dayjs';
import type { LucideIcon } from 'lucide-react';
import { type ElementType, memo } from 'react';
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import TrendArrow from '@/components/atomic/TrendArrow';
import TrendPercentage from '@/components/atomic/TrendPercentage';
import { Card } from '@/components/ui/card';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMetricNumber } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface MiniChartDataPoint {
	date: string;
	value: number;
}

interface Trend {
	change?: number;
	current: number;
	previous: number;
	currentPeriod: { start: string; end: string };
	previousPeriod: { start: string; end: string };
}

interface StatCardProps {
	title: string;
	titleExtra?: React.ReactNode;
	value: string | number;
	description?: string;
	icon?: ElementType | LucideIcon;
	trend?: Trend | number;
	trendLabel?: string;
	isLoading?: boolean;
	className?: string;
	variant?: 'default' | 'success' | 'info' | 'warning' | 'danger';
	invertTrend?: boolean;
	id?: string;
	chartData?: MiniChartDataPoint[];
	showChart?: boolean;
	formatValue?: (value: number) => string;
	formatChartValue?: (value: number) => string;
}

const formatTrendValue = (
	value: string | number,
	formatter?: (v: number) => string
) => {
	if (typeof value === 'number') {
		if (formatter) {
			return formatter(value);
		}
		return Number.isInteger(value)
			? formatMetricNumber(value)
			: value.toFixed(1);
	}
	return value;
};

const MiniChart = memo(
	({
		data,
		id,
		formatChartValue,
	}: {
		data: MiniChartDataPoint[];
		id: string;
		formatChartValue?: (value: number) => string;
	}) => {
		const hasData = data && data.length > 0;
		const hasVariation = hasData && data.some((d) => d.value !== data[0].value);

		if (!hasData) {
			return (
				<div className="flex h-7 items-center justify-center">
					<div className="text-muted-foreground text-xs">No data</div>
				</div>
			);
		}

		if (!hasVariation) {
			return (
				<div className="flex h-7 items-center">
					<div className="h-0.5 w-full rounded-full bg-primary/20" />
				</div>
			);
		}

		return (
			<div className="chart-container group/chart">
				<ResponsiveContainer height={28} width="100%">
					<AreaChart
						data={data}
						margin={{ top: 2, right: 1, left: 1, bottom: 2 }}
					>
						<defs>
							<linearGradient id={`gradient-${id}`} x1="0" x2="0" y1="0" y2="1">
								<stop
									offset="0%"
									stopColor="var(--chart-color)"
									stopOpacity={0.8}
								/>
								<stop
									offset="50%"
									stopColor="var(--chart-color)"
									stopOpacity={0.3}
								/>
								<stop
									offset="100%"
									stopColor="var(--chart-color)"
									stopOpacity={0.05}
								/>
							</linearGradient>
							<filter id={`glow-${id}`}>
								<feGaussianBlur result="coloredBlur" stdDeviation="2" />
								<feMerge>
									<feMergeNode in="coloredBlur" />
									<feMergeNode in="SourceGraphic" />
								</feMerge>
							</filter>
						</defs>
						<XAxis dataKey="date" hide />
						<YAxis domain={['dataMin - 10%', 'dataMax + 10%']} hide />
						<Tooltip
							content={({ active, payload, label }) =>
								active &&
								payload?.[0] &&
								typeof payload[0].value === 'number' ? (
									<div className="rounded-lg border border-border/50 bg-background/95 p-3 text-xs shadow-xl backdrop-blur-sm">
										<p className="mb-1 font-medium text-foreground">
											{new Date(label).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: data.length > 30 ? 'numeric' : undefined,
											})}
										</p>
										<p className="font-semibold text-primary">
											{formatChartValue
												? formatChartValue(payload[0].value)
												: formatMetricNumber(payload[0].value)}
										</p>
									</div>
								) : null
							}
							cursor={{
								stroke: 'var(--chart-color)',
								strokeWidth: 1,
								strokeOpacity: 0.3,
							}}
						/>
						<Area
							activeDot={{
								r: 3,
								fill: 'var(--chart-color)',
								stroke: 'var(--background)',
								strokeWidth: 2,
								filter: `url(#glow-${id})`,
							}}
							dataKey="value"
							dot={false}
							fill={`url(#gradient-${id})`}
							stroke="var(--chart-color)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		);
	}
);

MiniChart.displayName = 'MiniChart';

const DURATION_REGEX = /\d+(\.\d+)?(s|ms)$/;

export function StatCard({
	title,
	titleExtra,
	value,
	description,
	icon: Icon,
	trend,
	trendLabel,
	isLoading = false,
	className,
	variant = 'default',
	invertTrend = false,
	id,
	chartData,
	showChart = false,
	formatValue,
	formatChartValue,
}: StatCardProps) {
	const getVariantClasses = () => {
		switch (variant) {
			case 'success':
				return 'bg-accent/10 border-accent/20';
			case 'info':
				return 'bg-accent/10 border-accent/20';
			case 'warning':
				return 'bg-muted border-border';
			case 'danger':
				return 'bg-destructive/10 border-destructive/20';
			default:
				return '';
		}
	};

	const trendValue =
		typeof trend === 'object' && trend !== null ? trend.change : trend;

	if (isLoading) {
		return (
			<Card
				className={cn(
					'group overflow-hidden pt-0',
					'border-border/50',
					'bg-card',
					className
				)}
				id={id}
			>
				<div className="relative p-3 sm:p-4">
					<div className="relative z-10 space-y-1.5 sm:space-y-2">
						<div className="flex items-start justify-between">
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<Skeleton className="h-[10px] w-20 rounded-full sm:h-3" />
								</div>
								<Skeleton className="mt-1 h-6 w-24 rounded-md sm:h-8" />
							</div>
							{Icon && (
								<div className="ml-1.5 flex-shrink-0 rounded-lg bg-muted/50 p-1 sm:ml-2 sm:p-1.5">
									<Skeleton className="h-3 w-3 rounded-full sm:h-4 sm:w-4" />
								</div>
							)}
						</div>

						<div className="flex items-center gap-2">
							<Skeleton className="h-4 w-12 rounded-full" />
							<Skeleton className="h-3 w-16 rounded-full" />
						</div>
					</div>
				</div>
				{showChart && (
					<div className="-mb-0.5 sm:-mb-1 p-1">
						<Skeleton className="h-7 w-full rounded-sm" />
					</div>
				)}
			</Card>
		);
	}

	const isTimeValue = typeof value === 'string' && DURATION_REGEX.test(value);

	const displayValue =
		(typeof value === 'string' && (value.endsWith('%') || isTimeValue)) ||
		typeof value !== 'number'
			? value.toString()
			: formatMetricNumber(value);

	const hasValidChartData = showChart && chartData && chartData.length > 0;

	const cardContent = (
		<Card
			className={cn(
				'group overflow-hidden pt-0',
				'border-border/50 hover:border-primary/20',
				'bg-card',
				getVariantClasses(),
				className
			)}
			id={id}
		>
			<div className="relative p-3 sm:p-4">
				<div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent opacity-0 group-hover:opacity-100" />

				<div className="relative z-10 space-y-1.5 sm:space-y-2">
					<div className="flex items-start justify-between">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<p className="line-clamp-1 font-semibold text-[9px] text-muted-foreground uppercase tracking-wider sm:text-[10px] md:text-xs">
									{title}
								</p>
								{titleExtra}
							</div>
							<div
								className={cn(
									'font-bold text-foreground leading-tight group-hover:text-primary',
									isTimeValue
										? 'text-base sm:text-lg md:text-xl'
										: 'text-lg sm:text-xl md:text-2xl',
									typeof value === 'string' && value.length > 8
										? 'text-base sm:text-lg md:text-xl'
										: ''
								)}
							>
								{displayValue}
							</div>
						</div>
						{Icon && (
							<div className="ml-1.5 flex-shrink-0 rounded-lg bg-primary/5 p-1 group-hover:bg-primary/10 sm:ml-2 sm:p-1.5">
								<Icon className="h-3 w-3 text-primary/70 group-hover:text-primary sm:h-4 sm:w-4" />
							</div>
						)}
					</div>

					<div className="flex items-center justify-between text-[9px] sm:text-[10px] md:text-xs">
						<div className="flex min-h-[12px] items-center sm:min-h-[14px]">
							{trendValue !== undefined && !Number.isNaN(trendValue) && (
								<div className="flex items-center">
									<TrendArrow invertColor={invertTrend} value={trendValue} />
									<TrendPercentage
										className="ml-0.5"
										invertColor={invertTrend}
										value={trendValue}
									/>
								</div>
							)}
							{description &&
								(trendValue === undefined || Number.isNaN(trendValue)) && (
									<span className="font-medium text-muted-foreground">
										{description}
									</span>
								)}
						</div>
						{trendLabel &&
							trendValue !== undefined &&
							!Number.isNaN(trendValue) && (
								<span className="hidden text-right font-medium text-muted-foreground md:block">
									{trendLabel}
								</span>
							)}
					</div>

					{hasValidChartData && (
						<div className="-mb-0.5 sm:-mb-1 [--chart-color:theme(colors.primary.DEFAULT)] group-hover:[--chart-color:theme(colors.primary.500)]">
							<MiniChart
								data={chartData}
								formatChartValue={formatChartValue}
								id={id || `chart-${Math.random()}`}
							/>
						</div>
					)}
				</div>
			</div>
		</Card>
	);

	return typeof trend === 'object' &&
		trend !== null &&
		trend.currentPeriod &&
		trend.previousPeriod ? (
		<HoverCard>
			<HoverCardTrigger asChild>{cardContent}</HoverCardTrigger>
			<HoverCardContent className="w-80" sideOffset={10}>
				<div className="space-y-3">
					<div className="mb-2 flex items-center gap-2">
						{Icon && <Icon className="h-4 w-4 text-primary" />}
						<h4 className="font-semibold text-foreground">{title}</h4>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Previous</p>
							<p className="text-muted-foreground/80 text-xs">
								{dayjs(trend.previousPeriod.start).format('MMM D')} -{' '}
								{dayjs(trend.previousPeriod.end).format('MMM D')}
							</p>
							<p className="font-bold text-foreground text-lg">
								{formatTrendValue(trend.previous, formatValue)}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-muted-foreground text-xs">Current</p>
							<p className="text-muted-foreground/80 text-xs">
								{dayjs(trend.currentPeriod.start).format('MMM D')} -{' '}
								{dayjs(trend.currentPeriod.end).format('MMM D')}
							</p>
							<p className="font-bold text-foreground text-lg">
								{formatTrendValue(trend.current, formatValue)}
							</p>
						</div>
					</div>
					<div className="border-border/50 border-t pt-3">
						<div className="flex items-center justify-between">
							<div className="text-muted-foreground text-sm">Change</div>
							<div className="flex items-center font-bold text-base">
								<TrendArrow
									invertColor={invertTrend}
									value={trend.change || 0}
								/>
								<TrendPercentage
									className="ml-1"
									invertColor={invertTrend}
									value={trend.change || 0}
								/>
							</div>
						</div>
					</div>
				</div>
			</HoverCardContent>
		</HoverCard>
	) : (
		cardContent
	);
}
