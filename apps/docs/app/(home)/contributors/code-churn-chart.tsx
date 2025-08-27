'use client';

import { useMemo } from 'react';
import {
	Bar,
	BarChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { SciFiCard } from '@/components/scifi-card';
import { cn } from '@/lib/utils';

interface ProcessedCodeFrequency {
	week: string;
	additions: number;
	deletions: number;
	date: Date;
}

interface Props {
	data: ProcessedCodeFrequency[];
}

interface CustomTooltipProps {
	active?: boolean;
	payload?: Array<{
		value: number;
		name: string;
		color: string;
	}>;
	label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
	if (!(active && payload?.length)) {
		return null;
	}

	const additions = payload.find((p) => p.name === 'additions')?.value || 0;
	const deletions = payload.find((p) => p.name === 'deletions')?.value || 0;
	const net = additions - deletions;

	return (
		<div className="min-w-[200px] rounded border border-border/50 bg-background/95 p-3 shadow-lg backdrop-blur-sm">
			<div className="mb-2 border-border/30 border-b pb-2">
				<p className="font-medium text-foreground text-sm">Week of {label}</p>
			</div>
			<div className="space-y-1">
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-green-500" />
						<span className="text-muted-foreground text-xs">Added</span>
					</div>
					<span className="font-mono font-semibold text-foreground text-sm">
						+{additions.toLocaleString()}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="flex items-center gap-2">
						<div className="h-2 w-2 rounded-full bg-red-500" />
						<span className="text-muted-foreground text-xs">Removed</span>
					</div>
					<span className="font-mono font-semibold text-foreground text-sm">
						-{deletions.toLocaleString()}
					</span>
				</div>
				<div className="border-border/30 border-t pt-1">
					<div className="flex items-center justify-between gap-3">
						<span className="text-muted-foreground text-xs">Net Change</span>
						<span
							className={`font-mono font-semibold text-sm ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}
						>
							{net >= 0 ? '+' : ''}
							{net.toLocaleString()}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function CodeChurnChart({ data }: Props) {
	const { chartData, insights } = useMemo(() => {
		if (!data.length) {
			return {
				chartData: [],
				insights: {
					totalAdditions: 0,
					totalDeletions: 0,
					netGrowth: 0,
					avgWeeklyAdditions: 0,
					mostActiveWeek: null as string | null,
				},
			};
		}

		// Sort by date and take recent weeks
		const sortedData = [...data]
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.slice(-26) // Last 6 months
			.map((week) => ({
				...week,
				week: new Date(week.date).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
				}),
			}));

		const totalAdditions = sortedData.reduce(
			(sum, week) => sum + week.additions,
			0
		);
		const totalDeletions = sortedData.reduce(
			(sum, week) => sum + week.deletions,
			0
		);
		const netGrowth = totalAdditions - totalDeletions;
		const avgWeeklyAdditions = Math.round(totalAdditions / sortedData.length);

		// Find most active week (by total lines changed)
		const mostActiveWeek = sortedData.reduce((max, week) => {
			const current = week.additions + week.deletions;
			const maxTotal = max.additions + max.deletions;
			return current > maxTotal ? week : max;
		}, sortedData[0]);

		return {
			chartData: sortedData,
			insights: {
				totalAdditions,
				totalDeletions,
				netGrowth,
				avgWeeklyAdditions,
				mostActiveWeek: mostActiveWeek?.week || null,
			},
		};
	}, [data]);

	if (!chartData.length) {
		return (
			<div>
				<div className="mb-6 sm:mb-8">
					<h3 className="mb-2 font-semibold text-xl sm:text-2xl lg:text-3xl xl:text-4xl">
						Code Churn Activity
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
						Weekly code additions and deletions over time
					</p>
				</div>
				<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm sm:p-8">
					<div className="py-6 text-center text-muted-foreground text-sm sm:py-8 sm:text-base">
						No code frequency data available
					</div>
				</SciFiCard>
			</div>
		);
	}

	return (
		<div>
			<div className="mb-6 sm:mb-8">
				<h3 className="mb-2 font-semibold text-xl sm:text-2xl lg:text-3xl xl:text-4xl">
					Code Churn Activity
				</h3>
				<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
					Weekly code additions and deletions over the last 6 months •{' '}
					<span className="font-medium">
						{insights.totalAdditions.toLocaleString()} lines added
					</span>
				</p>
			</div>

			{/* Insights Cards */}
			<div className="mb-6 grid grid-cols-2 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
				<SciFiCard className="rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div className="font-bold text-green-600 text-lg sm:text-2xl">
						+{insights.totalAdditions.toLocaleString()}
					</div>
					<div className="text-muted-foreground text-xs sm:text-sm">
						Total Added
					</div>
				</SciFiCard>

				<SciFiCard className="rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div className="font-bold text-lg text-red-600 sm:text-2xl">
						-{insights.totalDeletions.toLocaleString()}
					</div>
					<div className="text-muted-foreground text-xs sm:text-sm">
						Total Removed
					</div>
				</SciFiCard>

				<SciFiCard className="rounded border border-border bg-card/50 p-4 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:p-6">
					<div
						className={cn(
							'font-bold text-lg sm:text-2xl',
							insights.netGrowth >= 0 ? 'text-green-600' : 'text-red-600'
						)}
					>
						{insights.netGrowth >= 0 ? '+' : ''}
						{insights.netGrowth.toLocaleString()}
					</div>
					<div className="text-muted-foreground text-xs sm:text-sm">
						Net Growth
					</div>
				</SciFiCard>

				<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">
						{insights.avgWeeklyAdditions.toLocaleString()}
					</div>
					<div className="text-muted-foreground text-sm">Avg Weekly</div>
				</SciFiCard>
			</div>

			{/* Chart */}
			<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
				<div className="relative h-[400px] w-full">
					<ResponsiveContainer height="100%" width="100%">
						<BarChart
							data={chartData}
							margin={{
								top: 20,
								right: 20,
								left: 20,
								bottom: 20,
							}}
						>
							<defs>
								<linearGradient
									id="additions-gradient"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
									<stop offset="50%" stopColor="#10b981" stopOpacity={0.7} />
									<stop offset="100%" stopColor="#10b981" stopOpacity={0.3} />
								</linearGradient>
								<linearGradient
									id="deletions-gradient"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="0%" stopColor="#ef4444" stopOpacity={0.9} />
									<stop offset="50%" stopColor="#ef4444" stopOpacity={0.7} />
									<stop offset="100%" stopColor="#ef4444" stopOpacity={0.3} />
								</linearGradient>
								<filter height="130%" id="glow">
									<feGaussianBlur result="coloredBlur" stdDeviation="2" />
									<feMerge>
										<feMergeNode in="coloredBlur" />
										<feMergeNode in="SourceGraphic" />
									</feMerge>
								</filter>
							</defs>
							<CartesianGrid
								className="stroke-border"
								strokeDasharray="1 3"
								strokeOpacity={0.3}
								vertical={false}
							/>
							<XAxis
								axisLine={false}
								className="fill-muted-foreground"
								dataKey="week"
								interval="preserveStartEnd"
								tick={{
									fontSize: 11,
									fontWeight: 500,
								}}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								className="fill-muted-foreground"
								tick={{
									fontSize: 11,
									fontWeight: 500,
								}}
								tickFormatter={(value) => `${Math.abs(value).toLocaleString()}`}
								tickLine={false}
								tickMargin={8}
								width={50}
							/>
							<Tooltip
								content={<CustomTooltip />}
								cursor={{
									fill: 'rgba(16, 185, 129, 0.1)',
								}}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Bar
								dataKey="additions"
								fill="url(#additions-gradient)"
								filter="url(#glow)"
								name="additions"
								radius={[1, 1, 0, 0]}
							/>
							<Bar
								dataKey="deletions"
								fill="url(#deletions-gradient)"
								filter="url(#glow)"
								name="deletions"
								radius={[1, 1, 0, 0]}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>
			</SciFiCard>

			{/* Additional Insights */}
			{insights.mostActiveWeek && (
				<SciFiCard className="mt-8 rounded border border-border bg-card/50 p-4 backdrop-blur-sm">
					<p className="text-muted-foreground text-sm">
						<span className="font-medium">Most active week:</span>{' '}
						{insights.mostActiveWeek} with{' '}
						{(
							chartData.find((d) => d.week === insights.mostActiveWeek)
								?.additions || 0
						).toLocaleString()}{' '}
						additions and{' '}
						{(
							chartData.find((d) => d.week === insights.mostActiveWeek)
								?.deletions || 0
						).toLocaleString()}{' '}
						deletions
					</p>
				</SciFiCard>
			)}
		</div>
	);
}
