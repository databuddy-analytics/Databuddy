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

interface CommitActivity {
	week: string;
	commits: number;
	date: Date;
}

interface CommitActivityChartProps {
	data: CommitActivity[];
}

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
		payload: CommitActivity;
	}>;
	label?: string;
}) => {
	if (!(active && payload && payload.length)) {
		return null;
	}

	const formatDate = (dateStr: string) => {
		return new Date(dateStr).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	};

	return (
		<div className="min-w-[200px] rounded border border-border/50 bg-background/95 p-3 shadow-lg backdrop-blur-sm">
			<div className="mb-2 border-border/30 border-b pb-2">
				<p className="font-medium text-foreground text-sm">
					{formatDate(label || '')}
				</p>
			</div>
			<div className="space-y-1">
				{payload.map((entry) => (
					<div
						className="flex items-center justify-between gap-3"
						key={entry.name}
					>
						<div className="flex items-center gap-2">
							<div className="h-2 w-2 rounded-full bg-blue-500" />
							<span className="text-muted-foreground text-xs">Commits</span>
						</div>
						<span className="font-mono font-semibold text-foreground text-sm">
							{entry.value.toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
};

export default function CommitActivityChart({
	data,
}: CommitActivityChartProps) {
	const { chartData, totalCommits, insights } = useMemo(() => {
		if (!data || data.length === 0) {
			return {
				chartData: [],
				totalCommits: 0,
				insights: { avgCommitsPerWeek: 0, trend: 'stable' as const },
			};
		}

		// Sort by date and take last 52 weeks
		const sortedData = [...data]
			.sort((a, b) => a.date.getTime() - b.date.getTime())
			.slice(-52);

		const totalCommitsValue = sortedData.reduce((sum, d) => sum + d.commits, 0);

		// Calculate insights
		const avgCommitsPerWeek = Math.round(totalCommitsValue / sortedData.length);
		const recentActivity = sortedData
			.slice(-4)
			.reduce((sum, d) => sum + d.commits, 0);
		const earlierActivity = sortedData
			.slice(-8, -4)
			.reduce((sum, d) => sum + d.commits, 0);
		const trend =
			recentActivity > earlierActivity
				? 'up'
				: recentActivity < earlierActivity
					? 'down'
					: 'stable';

		return {
			chartData: sortedData,
			totalCommits: totalCommitsValue,
			insights: { avgCommitsPerWeek, trend },
		};
	}, [data]);

	if (chartData.length === 0) {
		return (
			<div>
				<div className="mb-8">
					<h3 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
						Commit Activity
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
						52-week contribution timeline
					</p>
				</div>
				<div className="group relative rounded border border-border bg-card/50 p-8 backdrop-blur-sm">
					<div className="py-8 text-center text-muted-foreground">
						No commit activity data available
					</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div>
			<div className="mb-8">
				<h3 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Commit Activity
				</h3>
				<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
					52-week contribution timeline • {totalCommits.toLocaleString()} total
					commits
				</p>
			</div>

			{/* Insights Cards */}
			<div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">
						{totalCommits.toLocaleString()}
					</div>
					<div className="text-muted-foreground text-sm">Total Commits</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">{insights.avgCommitsPerWeek}</div>
					<div className="text-muted-foreground text-sm">Avg per Week</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>

				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="flex items-center gap-3">
						<div
							className={`font-bold text-2xl ${
								insights.trend === 'up'
									? 'text-green-500'
									: insights.trend === 'down'
										? 'text-red-500'
										: 'text-muted-foreground'
							}`}
						>
							{insights.trend === 'up'
								? '↗'
								: insights.trend === 'down'
									? '↘'
									: '→'}
						</div>
						<div className="font-bold text-lg capitalize">{insights.trend}</div>
					</div>
					<div className="text-muted-foreground text-sm">Recent Trend</div>

					{/* Sci-fi corners */}
					<div className="pointer-events-none absolute inset-0">
						<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
						<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
							<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
							<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
						</div>
					</div>
				</div>
			</div>

			{/* Chart */}
			<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
				<div className="relative" style={{ width: '100%', height: 400 }}>
					<ResponsiveContainer height="100%" width="100%">
						<BarChart
							barCategoryGap="10%"
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
									id="commits-gradient"
									x1="0"
									x2="0"
									y1="0"
									y2="1"
								>
									<stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
									<stop offset="50%" stopColor="#3b82f6" stopOpacity={0.7} />
									<stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3} />
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
								tickFormatter={(value) => {
									const date = new Date(value);
									return date.toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
									});
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
								tickLine={false}
								tickMargin={8}
								width={50}
							/>
							<Tooltip
								content={<CustomTooltip />}
								cursor={{
									fill: 'rgba(59, 130, 246, 0.1)',
								}}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Bar
								dataKey="commits"
								fill="url(#commits-gradient)"
								filter="url(#glow)"
								radius={[1, 1, 0, 0]}
							/>
						</BarChart>
					</ResponsiveContainer>
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>
		</div>
	);
}
