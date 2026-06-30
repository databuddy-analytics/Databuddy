"use client";

import type { DailyUsageByTypeRow, UsageResponse } from "@/types/billing";
import { useMemo, useState } from "react";
import { METRIC_COLORS } from "@/components/charts/metrics-constants";
import { DateRangePicker } from "@/components/date-range-picker";
import { Chart } from "@/components/ui/composables/chart";
import {
	chartAxisTickDefault,
	chartCartesianGridDefault,
	chartRechartsInteractiveLegendLabelClassName,
	chartRechartsLegendIconSize,
	chartRechartsLegendInteractiveWrapperStyle,
	chartTooltipCustomSurfaceClassName,
	chartTooltipHeaderRowClassName,
} from "@/lib/chart-presentation";
import { calculateOverageCost, type OverageInfo } from "../utils/billing-utils";
import { CalendarIcon } from "@databuddy/ui/icons";
import { Tabs } from "@databuddy/ui/client";
import { Card, EmptyState, Skeleton } from "@databuddy/ui";

type ViewMode = "daily" | "cumulative";

const {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} = Chart.Recharts;

const EVENT_TYPE_COLORS = {
	event: METRIC_COLORS.pageviews.primary,
	error: METRIC_COLORS.session_duration.primary,
	web_vitals: METRIC_COLORS.visitors.primary,
	custom_event: METRIC_COLORS.sessions.primary,
	outgoing_link: METRIC_COLORS.bounce_rate.primary,
} as const;

const EVENT_TYPES = Object.keys(EVENT_TYPE_COLORS);

function formatYAxis(value: number): string {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(0)}k`;
	}
	return value.toString();
}

interface ConsumptionChartProps {
	isLoading: boolean;
	onDateRangeChange: (startDate: string, endDate: string) => void;
	overageInfo: OverageInfo | null;
	usageData?: UsageResponse;
}

export function ConsumptionChart({
	usageData,
	isLoading,
	onDateRangeChange,
	overageInfo,
}: ConsumptionChartProps) {
	const [viewMode, setViewMode] = useState<ViewMode>("daily");
	const [hiddenTypes, setHiddenTypes] = useState<Record<string, boolean>>({});

	const chartData = useMemo(() => {
		if (!usageData?.dailyUsageByType) {
			return [];
		}

		const dailyDataMap = new Map<string, Record<string, number>>();
		const allDates = [
			...new Set(
				usageData.dailyUsageByType.map((row: DailyUsageByTypeRow) => row.date)
			),
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

		for (const row of usageData.dailyUsageByType) {
			const dayData = dailyDataMap.get(row.date);
			if (dayData) {
				dayData[row.event_category] = row.event_count;
			}
		}

		const runningTotals: Record<string, number> = {};
		for (const key of EVENT_TYPES) {
			runningTotals[key] = 0;
		}

		return Array.from(dailyDataMap.entries()).map(([date, eventCounts]) => {
			const dayData: Record<string, string | number> = {
				date: new Date(date).toLocaleDateString("en-US", {
					month: "short",
					day: "numeric",
				}),
				fullDate: date,
			};

			for (const eventType of EVENT_TYPES) {
				if (hiddenTypes[eventType]) {
					dayData[eventType] = 0;
					continue;
				}
				const amount = eventCounts[eventType] || 0;
				if (viewMode === "cumulative") {
					runningTotals[eventType] += amount;
					dayData[eventType] = runningTotals[eventType];
				} else {
					dayData[eventType] = amount;
				}
			}

			return dayData;
		});
	}, [usageData?.dailyUsageByType, viewMode, hiddenTypes]);

	if (isLoading) {
		return (
			<Card>
				<Card.Header className="flex-row items-start justify-between gap-4">
					<div className="space-y-1">
						<Skeleton className="h-3.5 w-40" />
						<Skeleton className="h-3 w-56" />
					</div>
					<div className="flex items-center gap-2">
						<Skeleton className="h-7 w-40 rounded" />
						<Skeleton className="h-7 w-28 rounded" />
					</div>
				</Card.Header>
				<Card.Content>
					<Skeleton className="h-[280px] w-full rounded" />
				</Card.Content>
			</Card>
		);
	}

	if (!usageData || chartData.length === 0) {
		return (
			<Card>
				<Card.Header>
					<Card.Title>Consumption Breakdown</Card.Title>
					<Card.Description>Daily event volume by type</Card.Description>
				</Card.Header>
				<Card.Content className="py-8">
					<EmptyState
						icon={<CalendarIcon weight="duotone" />}
						title="No data available"
					/>
				</Card.Content>
			</Card>
		);
	}

	const maxValue = Math.max(
		...chartData.map((d) =>
			EVENT_TYPES.reduce((sum, key) => {
				const v = d[key];
				return sum + (typeof v === "number" ? v : 0);
			}, 0)
		)
	);

	return (
		<Card>
			<Card.Header className="flex-row flex-wrap items-start justify-between gap-4">
				<div>
					<Card.Title>Consumption Breakdown</Card.Title>
					<Card.Description>Daily event volume by type</Card.Description>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<DateRangePicker
						className="w-auto"
						maxDate={new Date()}
						minDate={new Date(2020, 0, 1)}
						onChange={(range) => {
							if (range?.from && range?.to) {
								onDateRangeChange(
									range.from.toISOString().split("T")[0],
									range.to.toISOString().split("T")[0]
								);
							}
						}}
						value={{
							from: new Date(usageData.dateRange.startDate),
							to: new Date(usageData.dateRange.endDate),
						}}
					/>
					<Tabs
						onValueChange={(v) => setViewMode(v as ViewMode)}
						value={viewMode}
					>
						<Tabs.List>
							<Tabs.Tab value="daily">Daily</Tabs.Tab>
							<Tabs.Tab value="cumulative">Cumulative</Tabs.Tab>
						</Tabs.List>
					</Tabs>
				</div>
			</Card.Header>
			<Card.Content className="p-0">
				<div className="px-2 pt-4 pb-2">
					<div className="h-[280px]">
						<ResponsiveContainer height="100%" width="100%">
							<BarChart
								data={chartData}
								margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
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
								<CartesianGrid {...chartCartesianGridDefault} />
								<XAxis
									axisLine={false}
									dataKey="date"
									tick={chartAxisTickDefault}
									tickLine={false}
								/>
								<YAxis
									axisLine={false}
									domain={[0, Math.ceil(maxValue * 1.1)]}
									tick={chartAxisTickDefault}
									tickFormatter={formatYAxis}
									tickLine={false}
									width={45}
								/>
								<Tooltip
									content={({ active, payload, label }) => {
										if (!(active && payload?.length)) {
											return null;
										}

										const visible = payload.filter(
											(e) => e.value && (e.value as number) > 0
										);
										if (!visible.length) {
											return null;
										}

										return (
											<div className={chartTooltipCustomSurfaceClassName()}>
												<div className={chartTooltipHeaderRowClassName}>
													<span className="font-semibold text-foreground text-xs">
														{label}
													</span>
												</div>
												<div className="space-y-1.5">
													{visible.map((entry) => {
														const eventType =
															entry.dataKey as keyof typeof EVENT_TYPE_COLORS;
														const color = EVENT_TYPE_COLORS[eventType];
														const count = entry.value as number;
														const cost = usageData
															? calculateOverageCost(
																	count,
																	usageData.totalEvents,
																	overageInfo
																)
															: 0;

														return (
															<div
																className="flex items-center justify-between gap-4"
																key={eventType}
															>
																<div className="flex items-center gap-2">
																	<span
																		className="size-2 shrink-0 rounded-full"
																		style={{ backgroundColor: color }}
																	/>
																	<span className="text-muted-foreground text-xs capitalize">
																		{eventType.replace("_", " ")}
																	</span>
																</div>
																<div className="text-right">
																	<span className="font-medium text-foreground text-xs tabular-nums">
																		{count.toLocaleString()}
																	</span>
																	{cost > 0 && (
																		<span className="ml-1.5 text-muted-foreground text-xs tabular-nums">
																			${cost.toFixed(2)}
																		</span>
																	)}
																</div>
															</div>
														);
													})}
												</div>
											</div>
										);
									}}
									cursor={Chart.tooltipCursorBar}
									wrapperStyle={{ outline: "none" }}
								/>
								<Legend
									align="center"
									formatter={(value) => {
										const key = String(value);
										return (
											<span
												className={chartRechartsInteractiveLegendLabelClassName(
													!!hiddenTypes[key]
												)}
											>
												{key.replace("_", " ")}
											</span>
										);
									}}
									iconSize={chartRechartsLegendIconSize}
									iconType="circle"
									onClick={(payload) => {
										const p = payload as unknown as {
											dataKey?: string | number;
											value?: string | number;
										};
										const key = String(p?.dataKey ?? p?.value ?? "");
										if (!key) {
											return;
										}
										setHiddenTypes((prev) => ({
											...prev,
											[key]: !prev[key],
										}));
									}}
									verticalAlign="bottom"
									wrapperStyle={chartRechartsLegendInteractiveWrapperStyle}
								/>
								{EVENT_TYPES.map((eventType) => (
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
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			</Card.Content>
		</Card>
	);
}
