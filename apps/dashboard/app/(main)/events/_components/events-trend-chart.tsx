"use client";

import {
	ArrowCounterClockwiseIcon,
	ChartBarIcon,
	ChartLineUpIcon,
	LightningIcon,
	ListBulletsIcon,
} from "@phosphor-icons/react";
import { useCallback, useMemo, useState } from "react";
import {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	Customized,
	Legend,
	ReferenceArea,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { METRIC_COLORS } from "@/components/charts/metrics-constants";
import { useDynamicDasharray } from "@/components/charts/use-dynamic-dasharray";
import { TableEmptyState } from "@/components/table/table-empty-state";
import { Button } from "@/components/ui/button";
import { InlineToggle } from "@/components/ui/inline-toggle";

export const EVENT_COLORS = [
	"#2E27F5",
	"#40BCF7",
	"#8b5cf6",
	"#f59e0b",
	"#ef4444",
	"#10b981",
	"#ec4899",
	"#06b6d4",
	"#f97316",
	"#22c55e",
	"#a855f7",
	"#14b8a6",
];

const EVENTS_COLOR = METRIC_COLORS.pageviews.primary;
const USERS_COLOR = METRIC_COLORS.visitors.primary;
const CHART_HEIGHT = 300;

type ChartMode = "aggregate" | "by-event";
type ChartType = "area" | "bar";

interface EventsTrendChartProps {
	chartData: Array<{ date: string; events: number; users: number }>;
	perEventData?: Record<string, string | number>[];
	eventNames?: string[];
	isFetching?: boolean;
	isLoading?: boolean;
}

function formatYTick(value: number): string {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1000) {
		return `${(value / 1000).toFixed(1)}k`;
	}
	return value.toString();
}

function ChartTooltip({
	active,
	payload,
	label,
	resolveColor,
}: {
	active?: boolean;
	payload?: Array<{
		dataKey: string;
		name: string;
		value: number;
		color: string;
	}>;
	label?: string;
	resolveColor?: (entry: { dataKey: string; color: string }) => string;
}) {
	if (!(active && payload?.length)) {
		return null;
	}

	const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

	return (
		<div className="min-w-[160px] rounded border bg-popover p-2.5 shadow-lg">
			{label && (
				<div className="mb-2 flex items-center gap-2 border-b pb-2">
					<div className="size-1.5 animate-pulse rounded-full bg-chart-1" />
					<p className="font-medium text-foreground text-xs">{label}</p>
				</div>
			)}
			<div className="max-h-48 space-y-1 overflow-y-auto">
				{sorted.map((entry) => (
					<div
						className="flex items-center justify-between gap-3"
						key={entry.dataKey}
					>
						<div className="flex items-center gap-1.5">
							<div
								className="size-2 shrink-0 rounded-full"
								style={{
									backgroundColor: resolveColor
										? resolveColor(entry)
										: entry.color,
								}}
							/>
							<span className="max-w-[140px] truncate text-muted-foreground text-xs">
								{entry.name}
							</span>
						</div>
						<span className="font-semibold text-foreground text-xs tabular-nums">
							{(entry.value ?? 0).toLocaleString()}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

const AXIS_TICK = { fontSize: 10, fill: "var(--muted-foreground)" };
const GRID_PROPS = {
	stroke: "var(--border)",
	strokeDasharray: "3 3",
	strokeOpacity: 0.5,
	vertical: false,
} as const;
const TOOLTIP_WRAPPER = {
	outline: "none",
	zIndex: 10,
	pointerEvents: "auto",
} as const;

const MODE_OPTIONS = [
	{
		value: "aggregate" as const,
		label: (
			<>
				<ChartLineUpIcon className="size-3.5" weight="duotone" />
				<span className="hidden sm:inline">Total</span>
			</>
		),
		ariaLabel: "Show aggregate view",
	},
	{
		value: "by-event" as const,
		label: (
			<>
				<ListBulletsIcon className="size-3.5" weight="duotone" />
				<span className="hidden sm:inline">By Event</span>
			</>
		),
		ariaLabel: "Show per-event breakdown",
	},
];

const CHART_TYPE_OPTIONS = [
	{
		value: "area" as const,
		label: <ChartLineUpIcon className="size-3.5" weight="duotone" />,
		ariaLabel: "Area chart",
	},
	{
		value: "bar" as const,
		label: <ChartBarIcon className="size-3.5" weight="duotone" />,
		ariaLabel: "Bar chart",
	},
];

function aggregateColorResolver(entry: { dataKey: string }) {
	return entry.dataKey === "events" ? EVENTS_COLOR : USERS_COLOR;
}

function getEventColor(eventNames: string[], dataKey: string) {
	const idx = eventNames.indexOf(dataKey);
	return EVENT_COLORS[idx % EVENT_COLORS.length] ?? "#888";
}

function ChartCardShell({
	children,
	subtitle,
}: {
	children: React.ReactNode;
	subtitle?: string;
}) {
	return (
		<div className="flex h-full flex-col rounded border bg-card">
			<div className="flex items-center gap-3 border-b px-3 py-2.5 sm:px-4 sm:py-3">
				<div className="flex size-8 items-center justify-center rounded bg-accent">
					<LightningIcon
						className="size-4 text-muted-foreground"
						weight="duotone"
					/>
				</div>
				<div className="min-w-0 flex-1">
					<h2 className="font-semibold text-foreground text-sm sm:text-base">
						Events Trend
					</h2>
					{subtitle ? (
						<p className="text-muted-foreground text-xs">{subtitle}</p>
					) : null}
				</div>
			</div>
			{children}
		</div>
	);
}

export function EventsTrendChart({
	chartData,
	perEventData = [],
	eventNames = [],
	isFetching,
	isLoading,
}: EventsTrendChartProps) {
	const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
	const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
	const [zoomedData, setZoomedData] = useState<typeof chartData | null>(null);
	const [zoomedPerEventData, setZoomedPerEventData] = useState<
		Record<string, string | number>[] | null
	>(null);
	const [chartMode, setChartMode] = useState<ChartMode>("by-event");
	const [chartType, setChartType] = useState<ChartType>("area");
	const [hiddenEvents, setHiddenEvents] = useState<Set<string>>(new Set());

	const hasPerEventData = perEventData.length > 0 && eventNames.length > 0;
	const activeMode = hasPerEventData ? chartMode : "aggregate";
	const isByEvent = activeMode === "by-event";

	const isZoomed = zoomedData !== null;
	const displayData = zoomedData ?? chartData;
	const displayPerEventData = zoomedPerEventData ?? perEventData;
	const activeData = isByEvent ? displayPerEventData : displayData;

	const resetZoom = useCallback(() => {
		setRefAreaLeft(null);
		setRefAreaRight(null);
		setZoomedData(null);
		setZoomedPerEventData(null);
	}, []);

	const handleMouseDown = (e: { activeLabel?: string }) => {
		if (!e?.activeLabel) {
			return;
		}
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: { activeLabel?: string }) => {
		if (!(refAreaLeft && e?.activeLabel)) {
			return;
		}
		setRefAreaRight(e.activeLabel);
	};

	const handleMouseUp = () => {
		if (!refAreaLeft) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight ?? refAreaLeft;
		const source = isByEvent ? displayPerEventData : displayData;
		const leftIndex = source.findIndex((d) => d.date === refAreaLeft);
		const rightIndex = source.findIndex((d) => d.date === rightBoundary);

		if (leftIndex === -1 || rightIndex === -1) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const [startIndex, endIndex] =
			leftIndex < rightIndex
				? [leftIndex, rightIndex]
				: [rightIndex, leftIndex];

		if (isByEvent) {
			setZoomedPerEventData(
				displayPerEventData.slice(startIndex, endIndex + 1)
			);
			setZoomedData(chartData.slice(startIndex, endIndex + 1));
		} else {
			setZoomedData(displayData.slice(startIndex, endIndex + 1));
		}

		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	const toggleEvent = useCallback((eventName: string) => {
		setHiddenEvents((prev) => {
			const next = new Set(prev);
			if (next.has(eventName)) {
				next.delete(eventName);
			} else {
				next.add(eventName);
			}
			return next;
		});
	}, []);

	const totalEvents = displayData.reduce((sum, d) => sum + d.events, 0);
	const totalUsers = displayData.reduce((sum, d) => sum + d.users, 0);

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		splitIndex: activeData.length - 2,
		chartType: "monotone",
	});

	const resolveEventColor = useMemo(
		() => (entry: { dataKey: string }) =>
			getEventColor(eventNames, entry.dataKey),
		[eventNames]
	);

	if (isLoading) {
		return (
			<ChartCardShell>
				<div className="flex-1 p-3 sm:p-4">
					<div className="h-[300px] w-full animate-pulse rounded bg-muted" />
				</div>
			</ChartCardShell>
		);
	}

	if (!chartData.length) {
		return (
			<ChartCardShell subtitle="No data available">
				<div className="flex-1 p-3 sm:p-4">
					<TableEmptyState
						description="Event trends will appear here when events are tracked."
						icon={<LightningIcon className="size-6 text-muted-foreground" />}
						title="No event trend data"
					/>
				</div>
			</ChartCardShell>
		);
	}

	const useBar = isByEvent && chartType === "bar";

	return (
		<div className="flex h-full flex-col rounded border bg-card">
			<div className="flex flex-col items-start justify-between gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 sm:py-3">
				<div className="flex items-center gap-3">
					<div className="flex size-8 items-center justify-center rounded bg-primary/10">
						<LightningIcon className="size-4 text-primary" weight="duotone" />
					</div>
					<div className="min-w-0">
						<h2 className="font-semibold text-foreground text-sm sm:text-base">
							Events Trend
						</h2>
						<p className="text-muted-foreground text-xs">
							{isByEvent
								? "Events broken down by type"
								: "Event occurrences over time"}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1.5">
					{isFetching && !isLoading && (
						<div className="flex items-center gap-1.5 text-muted-foreground text-xs">
							<ArrowCounterClockwiseIcon className="size-3 animate-spin" />
							<span>Updating...</span>
						</div>
					)}
					{isZoomed && (
						<Button
							className="h-7 gap-1 px-2 text-xs"
							onClick={resetZoom}
							size="sm"
							variant="outline"
						>
							<ArrowCounterClockwiseIcon className="size-3" weight="bold" />
							Reset
						</Button>
					)}
					{hasPerEventData && (
						<>
							<InlineToggle
								onValueChangeAction={setChartMode}
								options={MODE_OPTIONS}
								value={chartMode}
							/>
							<InlineToggle
								disabled={!isByEvent}
								onValueChangeAction={setChartType}
								options={CHART_TYPE_OPTIONS}
								value={chartType}
							/>
						</>
					)}
				</div>
			</div>

			{!isByEvent && (
				<div className="grid grid-cols-2 gap-3 border-b bg-muted/30 p-3">
					<div className="space-y-0.5">
						<p className="font-mono text-[10px] text-muted-foreground uppercase">
							Total Events
						</p>
						<p className="font-semibold text-foreground text-lg tabular-nums">
							{totalEvents.toLocaleString()}
						</p>
					</div>
					<div className="space-y-0.5">
						<p className="font-mono text-[10px] text-muted-foreground uppercase">
							Unique Users
						</p>
						<p className="font-semibold text-foreground text-lg tabular-nums">
							{totalUsers.toLocaleString()}
						</p>
					</div>
				</div>
			)}

			<div className="relative flex-1 overflow-hidden p-2">
				<div
					className="relative select-none"
					style={{ width: "100%", height: CHART_HEIGHT, minWidth: 300 }}
				>
					<ResponsiveContainer height="100%" width="100%">
						<ComposedChart
							className={useBar ? "events-bar-chart" : undefined}
							data={activeData}
							margin={{ top: 10, right: 10, left: 0, bottom: 35 }}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
						>
							<defs>
								<linearGradient id="colorEvents" x1="0" x2="0" y1="0" y2="1">
									<stop
										offset="5%"
										stopColor={EVENTS_COLOR}
										stopOpacity={0.3}
									/>
									<stop
										offset="95%"
										stopColor={EVENTS_COLOR}
										stopOpacity={0.05}
									/>
								</linearGradient>
								<linearGradient id="colorUsers" x1="0" x2="0" y1="0" y2="1">
									<stop offset="5%" stopColor={USERS_COLOR} stopOpacity={0.3} />
									<stop
										offset="95%"
										stopColor={USERS_COLOR}
										stopOpacity={0.05}
									/>
								</linearGradient>
							</defs>
							<CartesianGrid {...GRID_PROPS} />
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={AXIS_TICK}
								tickLine={false}
							/>
							<YAxis
								allowDecimals={false}
								axisLine={false}
								tick={AXIS_TICK}
								tickFormatter={formatYTick}
								tickLine={false}
								width={40}
							/>
							<Tooltip
								content={
									<ChartTooltip
										resolveColor={
											isByEvent ? resolveEventColor : aggregateColorResolver
										}
									/>
								}
								cursor={
									useBar ? { fill: "var(--accent)", opacity: 0.3 } : undefined
								}
								wrapperStyle={TOOLTIP_WRAPPER}
							/>
							{refAreaLeft && refAreaRight && (
								<ReferenceArea
									fill="var(--chart-1)"
									fillOpacity={0.1}
									stroke="var(--chart-1)"
									strokeOpacity={0.3}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}
							{isByEvent && (
								<Legend
									formatter={(label: string) => {
										const isHidden = hiddenEvents.has(label);
										return (
											<span
												className={`cursor-pointer text-xs ${
													isHidden
														? "text-muted-foreground line-through opacity-50"
														: "text-muted-foreground hover:text-foreground"
												}`}
											>
												{label}
											</span>
										);
									}}
									iconSize={8}
									iconType="circle"
									onClick={(p: { value: string }) => toggleEvent(p.value)}
									verticalAlign="bottom"
									wrapperStyle={{ paddingTop: "12px", fontSize: "12px" }}
								/>
							)}
							{!isByEvent && (
								<Legend
									iconSize={8}
									iconType="circle"
									wrapperStyle={{
										fontSize: "10px",
										paddingTop: "5px",
									}}
								/>
							)}
							{isByEvent &&
								eventNames.map((name, idx) => {
									const color =
										EVENT_COLORS[idx % EVENT_COLORS.length] ?? "#888";
									const hidden = hiddenEvents.has(name);

									if (useBar) {
										return (
											<Bar
												dataKey={name}
												fill={color}
												hide={hidden}
												key={name}
												name={name}
												stackId="events"
											/>
										);
									}

									return (
										<Area
											dataKey={name}
											fill={color}
											fillOpacity={0.1}
											hide={hidden}
											key={name}
											name={name}
											stroke={color}
											strokeDasharray={
												lineDasharrays.find((l) => l.name === name)
													?.strokeDasharray || "0 0"
											}
											strokeWidth={1.5}
											type="monotone"
										/>
									);
								})}
							{!isByEvent && (
								<Area
									dataKey="events"
									fill="url(#colorEvents)"
									fillOpacity={1}
									name="Events"
									stroke={EVENTS_COLOR}
									strokeDasharray={
										lineDasharrays.find((l) => l.name === "events")
											?.strokeDasharray || "0 0"
									}
									strokeWidth={2}
									type="monotone"
								/>
							)}
							{!isByEvent && (
								<Area
									dataKey="users"
									fill="url(#colorUsers)"
									fillOpacity={1}
									name="Users"
									stroke={USERS_COLOR}
									strokeDasharray={
										lineDasharrays.find((l) => l.name === "users")
											?.strokeDasharray || "0 0"
									}
									strokeWidth={2}
									type="monotone"
								/>
							)}
							<Customized component={DasharrayCalculator} />
						</ComposedChart>
					</ResponsiveContainer>
				</div>
			</div>

			<style>{`
				.events-bar-chart .recharts-bar {
					cursor: pointer;
					transition: opacity 150ms ease-out;
				}
				.events-bar-chart:has(.recharts-bar:hover) .recharts-bar:not(:hover) {
					opacity: 0.15;
				}
			`}</style>
		</div>
	);
}
