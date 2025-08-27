'use client';

import type { QueryPerformanceSummary } from '@databuddy/shared';
import {
	Bar,
	BarChart,
	Cell,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';

const CHART_COLORS = [
	'#3b82f6', // Blue
	'#10b981', // Emerald
	'#8b5cf6', // Violet
	'#f59e0b', // Amber
	'#ef4444', // Red
];

const formatTime = (ms: number): string => {
	if (ms < 1000) {
		return `${ms.toFixed(1)}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
};

const formatQuery = (query: string, maxLength = 30): string => {
	const cleaned = query
		.replace(/--.*$/gm, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.trim();
	if (cleaned.length <= maxLength) {
		return cleaned;
	}
	return `${cleaned.slice(0, maxLength)}...`;
};

export const ResourceConsumptionChart = ({
	topQueriesByTime,
	onQueryClick,
}: {
	topQueriesByTime: QueryPerformanceSummary[];
	onQueryClick?: (query: QueryPerformanceSummary) => void;
}) => {
	const chartData = topQueriesByTime.slice(0, 5).map((query) => ({
		name: formatQuery(query.query, 25),
		value: query.percentage_of_total_time,
		fullQuery: query.query,
		originalQuery: query,
	}));

	return (
		<div className="rounded-xl border bg-card shadow-sm">
			<div className="border-b px-6 py-4">
				<h3 className="font-semibold text-lg">Resource Consumption</h3>
				<p className="text-muted-foreground text-sm">
					Top queries by database time consumption
				</p>
			</div>
			<div className="p-6">
				<ResponsiveContainer height={300} width="100%">
					<PieChart>
						<Pie
							cx="50%"
							cy="50%"
							data={chartData}
							dataKey="value"
							innerRadius={60}
							onClick={(data) => {
								if (onQueryClick && data.originalQuery) {
									onQueryClick(data.originalQuery);
								}
							}}
							outerRadius={120}
						>
							{chartData.map((query, index) => (
								<Cell
									fill={CHART_COLORS[index % CHART_COLORS.length]}
									key={`cell-${index}-${query.name}`}
									style={{ cursor: onQueryClick ? 'pointer' : 'default' }}
								/>
							))}
						</Pie>
						<Tooltip
							content={({ active, payload }) => {
								if (active && payload && payload[0]) {
									const data = payload[0].payload;
									return (
										<div className="rounded-lg border bg-background p-3 shadow-lg">
											<p className="font-medium">{data.name}</p>
											<p className="text-muted-foreground text-sm">
												{data.value.toFixed(1)}% of total time
											</p>
										</div>
									);
								}
								return null;
							}}
						/>
					</PieChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
};

export const ResponseTimeChart = ({
	slowestQueries,
	onQueryClick,
}: {
	slowestQueries: QueryPerformanceSummary[];
	onQueryClick?: (query: QueryPerformanceSummary) => void;
}) => {
	const chartData = slowestQueries.slice(0, 8).map((query) => ({
		name: formatQuery(query.query, 20),
		avgTime: query.mean_exec_time,
		maxTime: query.max_exec_time,
		minTime: query.min_exec_time,
		fullQuery: query.query,
		originalQuery: query,
	}));

	return (
		<div className="rounded-xl border bg-card shadow-sm">
			<div className="border-b px-6 py-4">
				<h3 className="font-semibold text-lg">Response Times</h3>
				<p className="text-muted-foreground text-sm">
					Average response time by query
				</p>
			</div>
			<div className="p-6">
				<ResponsiveContainer height={300} width="100%">
					<BarChart data={chartData} margin={{ left: 20 }}>
						<XAxis
							angle={-45}
							dataKey="name"
							height={80}
							textAnchor="end"
							tick={{ fontSize: 12 }}
						/>
						<YAxis tickFormatter={formatTime} />
						<Tooltip
							content={({ active, payload, label }) => {
								if (active && payload && payload[0]) {
									const data = payload[0].payload;
									return (
										<div className="rounded-lg border bg-background p-3 shadow-lg">
											<p className="font-medium">{label}</p>
											<p className="text-sm">
												<span className="text-muted-foreground">Avg:</span>{' '}
												{formatTime(data.avgTime)}
											</p>
											<p className="text-sm">
												<span className="text-muted-foreground">Min:</span>{' '}
												{formatTime(data.minTime)}
											</p>
											<p className="text-sm">
												<span className="text-muted-foreground">Max:</span>{' '}
												{formatTime(data.maxTime)}
											</p>
										</div>
									);
								}
								return null;
							}}
						/>
						<Bar
							dataKey="avgTime"
							fill="#ef4444"
							onClick={(data) => {
								if (onQueryClick && data.originalQuery) {
									onQueryClick(data.originalQuery);
								}
							}}
							style={{ cursor: onQueryClick ? 'pointer' : 'default' }}
						/>
					</BarChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
};
