"use client";

import { ChartLineIcon, SpinnerIcon } from "@phosphor-icons/react";
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
import { EmptyState } from "@/components/empty-state";

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

type TooltipPayload = {
	payload: RetentionRate & { fullDate?: string };
};

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
	if (!(active && payload?.length)) {
		return null;
	}

	const data = payload[0]?.payload;
	const dateStr = data?.fullDate || data?.date;
	const date = dayjs(dateStr).isValid() ? dayjs(dateStr) : null;

	if (!date || !data) {
		return null;
	}

	const totalUsers = data.new_users + data.returning_users;
	const returningPercentage =
		totalUsers > 0 ? (data.returning_users / totalUsers) * 100 : 0;
	const newPercentage =
		totalUsers > 0 ? (data.new_users / totalUsers) * 100 : 0;

	return (
		<div className="min-w-[180px] rounded border border-border bg-popover p-2.5 shadow-lg">
			<div className="mb-2 font-semibold text-foreground text-sm">
				{date.format("MMM D, YYYY")}
			</div>
			<div className="space-y-1.5">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="size-2 rounded-full bg-primary" />
						<span className="text-muted-foreground text-xs">Retention</span>
					</div>
					<span className="font-semibold text-foreground text-xs tabular-nums">
						{data.retention_rate.toFixed(1)}%
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="size-2 rounded-full bg-success" />
						<span className="text-muted-foreground text-xs">Returning</span>
					</div>
					<span className="font-medium text-foreground text-xs tabular-nums">
						{data.returning_users.toLocaleString()}
					</span>
				</div>
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2">
						<div className="size-2 rounded-full bg-muted" />
						<span className="text-muted-foreground text-xs">New</span>
					</div>
					<span className="font-medium text-foreground text-xs tabular-nums">
						{data.new_users.toLocaleString()}
					</span>
				</div>
			</div>
		</div>
	);
}

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
		return (
			<div className="flex h-full items-center justify-center">
				<div className="flex flex-col items-center gap-3">
					<SpinnerIcon className="size-6 animate-spin text-primary" />
					<span className="text-muted-foreground text-sm">Loading chart...</span>
				</div>
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<EmptyState
				description="No retention rate data available for the selected time period"
				icon={<ChartLineIcon className="text-muted-foreground" weight="duotone" />}
				title="No data"
				variant="minimal"
			/>
		);
	}

	return (
		<div className="flex h-full flex-col gap-3">
			{/* Legend */}
			<div className="flex items-center gap-4">
				<div className="flex items-center gap-2">
					<div className="size-2.5 rounded-full bg-primary" />
					<span className="text-muted-foreground text-xs">Daily Retention Rate</span>
				</div>
			</div>

			{/* Chart */}
			<div className="min-h-0 flex-1">
				<ResponsiveContainer height="100%" width="100%">
					<AreaChart
						data={chartData}
						margin={{ bottom: 12, left: 0, right: 12, top: 8 }}
					>
						<defs>
							<linearGradient
								id="retentionGradient"
								x1="0"
								x2="0"
								y1="0"
								y2="1"
							>
								<stop
									offset="0%"
									stopColor="var(--color-primary)"
									stopOpacity={0.35}
								/>
								<stop
									offset="50%"
									stopColor="var(--color-primary)"
									stopOpacity={0.12}
								/>
								<stop
									offset="100%"
									stopColor="var(--color-primary)"
									stopOpacity={0}
								/>
							</linearGradient>
						</defs>
						<CartesianGrid
							stroke="var(--color-border)"
							strokeDasharray="3 3"
							strokeOpacity={0.4}
							vertical={false}
						/>
						<XAxis
							axisLine={false}
							dataKey="date"
							dy={8}
							interval="preserveStartEnd"
							tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
							tickLine={false}
						/>
						<YAxis
							axisLine={false}
							domain={[0, maxRetention]}
							tick={{
								fontSize: 11,
								fill: "var(--color-muted-foreground)",
							}}
							tickFormatter={(value) => `${value}%`}
							tickLine={false}
							width={42}
						/>
						<Tooltip content={<CustomTooltip />} />
						<Area
							activeDot={{
								fill: "var(--color-primary)",
								r: 5,
								stroke: "var(--color-background)",
								strokeWidth: 2,
							}}
							connectNulls
							dataKey="retention_rate"
							fill="url(#retentionGradient)"
							fillOpacity={1}
							stroke="var(--color-primary)"
							strokeWidth={2}
							type="monotone"
						/>
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
