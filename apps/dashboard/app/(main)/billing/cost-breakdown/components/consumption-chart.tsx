'use client';

import type { UsageResponse } from '@databuddy/shared';
import { CalendarIcon, ChartBarIcon } from '@phosphor-icons/react';
import { useMemo, useState } from 'react';
import {
	Bar,
	BarChart,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { DateRangePicker } from '@/components/date-range-picker';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { calculateOverageCost, type OverageInfo } from '../utils/billing-utils';

type ViewMode = 'daily' | 'cumulative';

import { METRIC_COLORS } from '@/components/charts/metrics-constants';

const EVENT_TYPE_COLORS = {
	event: METRIC_COLORS.pageviews.primary, // blue
	error: METRIC_COLORS.session_duration.primary, // red
	web_vitals: METRIC_COLORS.visitors.primary, // green
	custom_event: METRIC_COLORS.sessions.primary, // purple
	outgoing_link: METRIC_COLORS.bounce_rate.primary, // amber
} as const;

interface ConsumptionChartProps {
	usageData?: UsageResponse;
	isLoading: boolean;
	onDateRangeChange: (startDate: string, endDate: string) => void;
	overageInfo: OverageInfo | null;
}

export function ConsumptionChart({
	usageData,
	isLoading,
	onDateRangeChange,
	overageInfo,
}: ConsumptionChartProps) {
	const [viewMode, setViewMode] = useState<ViewMode>('daily');
	const [hiddenTypes, setHiddenTypes] = useState<Record<string, boolean>>({});

	const chartData = useMemo(() => {
		if (!usageData?.dailyUsageByType) {
			return [];
		}

		// Group the real daily usage by type data by date
		const dailyDataMap = new Map<string, Record<string, number>>();

		// Initialize all dates with zero values for all event types
		const allDates = [
			...new Set(usageData.dailyUsageByType.map((row) => row.date)),
		].sort();
		for (const date of allDates) {
			dailyDataMap.set(date, {
				event: 0,
				error: 0,
				web_vitals: 0,
				custom_event: 0,
				outgoing_link: 0,
			});
		}

		// Fill in the actual data from ClickHouse
		for (const row of usageData.dailyUsageByType) {
			const dayData = dailyDataMap.get(row.date);
			if (dayData) {
				dayData[row.event_category] = row.event_count;
			}
		}

		// Convert to chart format with cumulative calculation if needed
		const runningTotals = Object.keys(EVENT_TYPE_COLORS).reduce(
			(acc, key) => {
				acc[key] = 0;
				return acc;
			},
			{} as Record<string, number>
		);

		const entries = Array.from(dailyDataMap.entries());

		return entries.map(([date, eventCounts]) => {
			const dayData: any = {
				date: new Date(date).toLocaleDateString('en-US', {
					month: 'short',
					day: 'numeric',
				}),
				fullDate: date,
			};

			// Use real data from ClickHouse, not approximations
			for (const eventType of Object.keys(EVENT_TYPE_COLORS)) {
				if (hiddenTypes[eventType]) {
					dayData[eventType] = 0;
					continue;
				}
				const actualAmount = eventCounts[eventType] || 0;

				if (viewMode === 'cumulative') {
					runningTotals[eventType] += actualAmount;
					dayData[eventType] = runningTotals[eventType];
				} else {
					dayData[eventType] = actualAmount;
				}
			}

			return dayData;
		});
	}, [usageData?.dailyUsageByType, viewMode, hiddenTypes]);

	if (isLoading) {
		return (
			<div className="flex h-full flex-col border-b">
				<div className="border-b bg-muted/20 px-6 py-4">
					<div className="flex items-center justify-between">
						<Skeleton className="h-6 w-48" />
						<Skeleton className="h-8 w-32" />
					</div>
				</div>
				<div className="flex-1 px-6 py-6">
					<Skeleton className="h-full" />
				</div>
			</div>
		);
	}

	if (!usageData || chartData.length === 0) {
		return (
			<div className="flex h-full flex-col border-b">
				<div className="border-b bg-muted/20 px-6 py-4">
					<div className="flex items-center gap-2">
						<ChartBarIcon className="h-5 w-5" weight="duotone" />
						<h2 className="font-semibold text-lg">Consumption Breakdown</h2>
					</div>
				</div>
				<div className="flex flex-1 items-center justify-center px-6 py-6">
					<div className="text-center">
						<CalendarIcon
							className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
							weight="duotone"
						/>
						<h3 className="font-semibold text-lg">No Data Available</h3>
						<p className="text-muted-foreground">
							No usage data found for the selected period
						</p>
					</div>
				</div>
			</div>
		);
	}

	const maxValue = Math.max(
		...chartData.map((d) =>
			Object.keys(EVENT_TYPE_COLORS).reduce(
				(sum, key) => sum + (d[key] || 0),
				0
			)
		)
	);
	const yAxisMax = Math.ceil(maxValue * 1.1);

	return (
		<div className="flex h-full flex-col border-b">
			<div className="border-b bg-muted/20 px-6 py-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<ChartBarIcon className="h-5 w-5" weight="duotone" />
						<h2 className="font-semibold text-lg">Consumption Breakdown</h2>
					</div>
					<div className="flex items-center gap-2">
						<DateRangePicker
							className="w-auto"
							maxDate={new Date()}
							minDate={new Date(2020, 0, 1)}
							onChange={(range) => {
								if (range?.from && range?.to) {
									onDateRangeChange(
										range.from.toISOString().split('T')[0],
										range.to.toISOString().split('T')[0]
									);
								}
							}}
							value={{
								from: new Date(usageData.dateRange.startDate),
								to: new Date(usageData.dateRange.endDate),
							}}
						/>
						<div className="flex rounded border">
							<Button
								className="rounded-r-none border-r"
								onClick={() => setViewMode('cumulative')}
								size="sm"
								variant={viewMode === 'cumulative' ? 'default' : 'ghost'}
							>
								Cumulative
							</Button>
							<Button
								className="rounded-l-none"
								onClick={() => setViewMode('daily')}
								size="sm"
								variant={viewMode === 'daily' ? 'default' : 'ghost'}
							>
								Daily
							</Button>
						</div>
						<Button
							className="text-xs"
							onClick={() => {
								const allHidden = Object.keys(EVENT_TYPE_COLORS).reduce(
									(acc, key) => {
										acc[key] = true;
										return acc;
									},
									{} as Record<string, boolean>
								);
								setHiddenTypes(allHidden);
							}}
							size="sm"
							variant="outline"
						>
							Select None
						</Button>
					</div>
				</div>
			</div>
			<div className="flex-1 px-6 py-6">
				<div className="h-full">
					<ResponsiveContainer height="100%" width="100%">
						<BarChart
							data={chartData}
							margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
							style={{
								cursor: 'default',
							}}
						>
							<defs>
								{Object.entries(EVENT_TYPE_COLORS).map(([key, color]) => (
									<linearGradient
										id={`gradient-${key}`}
										key={key}
										x1="0"
										x2="0"
										y1="0"
										y2="1"
									>
										<stop offset="0%" stopColor={color} stopOpacity={0.8} />
										<stop offset="100%" stopColor={color} stopOpacity={0.6} />
									</linearGradient>
								))}
							</defs>
							<XAxis
								axisLine={{ stroke: 'var(--border)', strokeOpacity: 0.5 }}
								dataKey="date"
								tick={{
									fontSize: 11,
									fill: 'var(--muted-foreground)',
									fontWeight: 500,
								}}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								domain={[0, yAxisMax]}
								tick={{
									fontSize: 11,
									fill: 'var(--muted-foreground)',
									fontWeight: 500,
								}}
								tickFormatter={(value) => {
									if (value >= 1_000_000) {
										return `${(value / 1_000_000).toFixed(1)}M`;
									}
									if (value >= 1000) {
										return `${(value / 1000).toFixed(1)}k`;
									}
									return value.toString();
								}}
								tickLine={false}
								width={45}
							/>
							<Tooltip
								content={({ active, payload, label }) => {
									if (active && payload && payload.length) {
										return (
											<div className="min-w-[200px] rounded border border-border/50 bg-card p-4">
												<div className="mb-3 flex items-center gap-2 border-border/30 border-b pb-2">
													<div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
													<p className="font-semibold text-foreground text-sm">
														{label}
													</p>
												</div>
												<div className="space-y-2.5">
													{payload
														.filter(
															(entry) =>
																entry.value && (entry.value as number) > 0
														)
														.map((entry, index) => {
															const eventType =
																entry.dataKey as keyof typeof EVENT_TYPE_COLORS;
															const color = EVENT_TYPE_COLORS[eventType];
															const eventCount = entry.value as number;
															const overageCost = usageData
																? calculateOverageCost(
																		eventCount,
																		usageData.totalEvents,
																		overageInfo
																	)
																: 0;

															return (
																<div
																	className="group flex items-center justify-between gap-3"
																	key={index}
																>
																	<div className="flex items-center gap-2.5">
																		<div
																			className="h-3 w-3 rounded-full shadow-sm ring-2 ring-background"
																			style={{ backgroundColor: color }}
																		/>
																		<span className="font-medium text-muted-foreground text-xs capitalize">
																			{entry.dataKey
																				?.toString()
																				.replace('_', ' ')}
																		</span>
																	</div>
																	<div className="text-right">
																		<div className="font-bold text-foreground text-sm group-hover:text-primary">
																			{eventCount.toLocaleString()}
																		</div>
																		<div className="text-muted-foreground text-xs">
																			${overageCost.toFixed(6)}
																		</div>
																	</div>
																</div>
															);
														})}
												</div>
											</div>
										);
									}
									return null;
								}}
								cursor={false}
								wrapperStyle={{ outline: 'none' }}
							/>
							<Legend
								align="center"
								formatter={(value) => {
									const key = String(value);
									const isHidden = hiddenTypes[key];
									return (
										<span
											className={`inline-flex select-none items-center font-medium text-xs capitalize leading-none transition-all duration-200 ${
												isHidden
													? 'text-slate-600 line-through decoration-1 opacity-40'
													: 'text-muted-foreground opacity-100'
											}`}
										>
											{key.replace('_', ' ')}
										</span>
									);
								}}
								iconSize={10}
								iconType="circle"
								layout="horizontal"
								onClick={(payload) => {
									const anyPayload = payload as unknown as {
										dataKey?: string | number;
										value?: string | number;
									};
									const raw = anyPayload?.dataKey ?? anyPayload?.value;
									if (raw == null) {
										return;
									}
									const key = String(raw);
									setHiddenTypes((prev) => ({ ...prev, [key]: !prev[key] }));
								}}
								verticalAlign="bottom"
								wrapperStyle={{
									display: 'flex',
									justifyContent: 'center',
									gap: 12,
									fontSize: '12px',
									paddingTop: '20px',
									fontWeight: 500,
									cursor: 'pointer',
								}}
							/>
							{Object.keys(EVENT_TYPE_COLORS).map((eventType) => (
								<Bar
									dataKey={eventType}
									fill={`url(#gradient-${eventType})`}
									hide={!!hiddenTypes[eventType]}
									key={eventType}
									stackId="events"
									stroke={
										EVENT_TYPE_COLORS[
											eventType as keyof typeof EVENT_TYPE_COLORS
										]
									}
									strokeWidth={0.5}
									style={{
										filter: 'none',
										transition: 'none',
									}}
								/>
							))}
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
}
