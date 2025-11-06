"use client";

import { ChartLineIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useMemo } from "react";
import {
	Area,
	AreaChart,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";

type RetentionRate = {
	date: string;
	new_users: number;
	returning_users: number;
	retention_rate: number;
};

type RetentionRateChartProps = {
	data: RetentionRate[];
	isLoading: boolean;
};

const CHART_HEIGHT = 450;
const CHART_MIN_VALUE = 0;

function CustomTooltip({ active, payload }: any) {
	if (!(active && payload?.length)) {
		return null;
	}

	const data = payload[0]?.payload as RetentionRate & { fullDate?: string };
	const dateStr = data.fullDate || data.date;
	const date = dayjs(dateStr).isValid() ? dayjs(dateStr) : null;

	if (!date) {
		return null;
	}

	const totalUsers = data.new_users + data.returning_users;
	const returningPercentage =
		totalUsers > 0 ? (data.returning_users / totalUsers) * 100 : 0;
	const newPercentage =
		totalUsers > 0 ? (data.new_users / totalUsers) * 100 : 0;

	return (
		<div className="min-w-[240px] rounded-lg border border-border bg-card p-4 shadow-lg backdrop-blur-sm">
			<div className="mb-3 font-semibold text-foreground text-sm">
				{date.format("MMM D, YYYY")}
			</div>
			<div className="space-y-2.5">
				<div className="flex items-center justify-between gap-6">
					<div className="flex items-center gap-2">
						<div className="h-2.5 w-2.5 rounded-full bg-chart-1" />
						<span className="text-muted-foreground text-xs">
							Retention Rate
						</span>
					</div>
					<span className="font-semibold text-foreground text-sm tabular-nums">
						{data.retention_rate.toFixed(1)}%
					</span>
				</div>
				<div className="border-border border-t pt-2.5">
					<div className="mb-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						User Breakdown
					</div>
					<div className="space-y-1.5">
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-chart-2" />
								<span className="text-muted-foreground text-xs">Returning</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="font-medium text-foreground text-xs tabular-nums">
									{returningPercentage.toFixed(1)}%
								</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									({data.returning_users.toLocaleString()})
								</span>
							</div>
						</div>
						<div className="flex items-center justify-between gap-4">
							<div className="flex items-center gap-2">
								<div className="h-2 w-2 rounded-full bg-chart-3" />
								<span className="text-muted-foreground text-xs">New</span>
							</div>
							<div className="flex items-center gap-2">
								<span className="font-medium text-foreground text-xs tabular-nums">
									{newPercentage.toFixed(1)}%
								</span>
								<span className="text-muted-foreground text-xs tabular-nums">
									({data.new_users.toLocaleString()})
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const RetentionChartSkeleton = () => (
	<div className="flex h-[450px] items-center justify-center">
		<div className="w-full space-y-4">
			<div className="flex h-[380px] w-full animate-pulse items-end justify-between gap-1 rounded-lg bg-muted/20">
				{Array.from({ length: 14 }).map((_, i) => (
					<div
						className="flex-1 rounded-t bg-chart-1/20"
						key={i}
						style={{
							height: `${30 + Math.random() * 50}%`,
							animationDelay: `${i * 50}ms`,
						}}
					/>
				))}
			</div>
			<div className="flex items-center justify-between px-2">
				{Array.from({ length: 7 }).map((_, i) => (
					<div
						className="h-3 w-12 animate-pulse rounded bg-muted/30"
						key={i}
						style={{
							animationDelay: `${i * 100}ms`,
							opacity: 0.3 + i * 0.1,
						}}
					/>
				))}
			</div>
		</div>
	</div>
);

export function RetentionRateChart({
	data,
	isLoading,
}: RetentionRateChartProps) {
	const chartData = useMemo(
		() =>
			data.map((item) => ({
				...item,
				date: dayjs(item.date).format("MMM D"),
				fullDate: item.date,
			})),
		[data]
	);

	const maxRetention = useMemo(() => {
		if (chartData.length === 0) {
			return 100;
		}
		const max = Math.max(...chartData.map((d) => d.retention_rate));
		return Math.min(100, Math.ceil(max * 1.15));
	}, [chartData]);

	if (isLoading) {
		return <RetentionChartSkeleton />;
	}

	if (data.length === 0) {
		return (
			<div className="flex h-[450px] flex-col items-center justify-center text-center">
				<ChartLineIcon className="mb-3 h-12 w-12 text-muted-foreground/40" />
				<p className="text-muted-foreground text-sm">
					No retention rate data available for the selected time period
				</p>
			</div>
		);
	}

	return (
		<div className="relative w-full">
			<div className="absolute top-0 right-0 z-10 flex items-center gap-4 rounded-lg border border-border bg-card/80 px-4 py-2 backdrop-blur-sm">
				<div className="flex items-center gap-2">
					<div className="h-2.5 w-2.5 rounded-full bg-chart-1" />
					<span className="text-muted-foreground text-xs">Retention Rate</span>
				</div>
			</div>
			<ResponsiveContainer height={CHART_HEIGHT} width="100%">
				<AreaChart
					data={chartData}
					margin={{ bottom: 20, left: 50, right: 20, top: 50 }}
				>
					<defs>
						<linearGradient id="retentionGradient" x1="0" x2="0" y1="0" y2="1">
							<stop
								offset="0%"
								stopColor="var(--color-chart-1)"
								stopOpacity={0.4}
							/>
							<stop
								offset="50%"
								stopColor="var(--color-chart-1)"
								stopOpacity={0.15}
							/>
							<stop
								offset="100%"
								stopColor="var(--color-chart-1)"
								stopOpacity={0.02}
							/>
						</linearGradient>
					</defs>
					<CartesianGrid
						stroke="var(--color-border)"
						strokeDasharray="3 4"
						strokeOpacity={0.2}
						vertical={false}
					/>
					<XAxis
						axisLine={false}
						dataKey="date"
						dy={10}
						tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
						tickLine={false}
					/>
					<YAxis
						axisLine={false}
						domain={[CHART_MIN_VALUE, maxRetention]}
						tick={{
							fontSize: 11,
							fill: "var(--color-muted-foreground)",
						}}
						tickFormatter={(value) => `${value}%`}
						tickLine={false}
						width={45}
					/>
					<Tooltip content={<CustomTooltip />} />
					<Area
						activeDot={{
							fill: "var(--color-chart-1)",
							r: 5,
							stroke: "var(--color-background)",
							strokeWidth: 2,
						}}
						connectNulls
						dataKey="retention_rate"
						fill="url(#retentionGradient)"
						fillOpacity={1}
						stroke="var(--color-chart-1)"
						strokeWidth={2.5}
						type="monotone"
					/>
				</AreaChart>
			</ResponsiveContainer>
		</div>
	);
}
