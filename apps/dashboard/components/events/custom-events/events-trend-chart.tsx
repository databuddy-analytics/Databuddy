"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { METRIC_COLORS } from "@/components/charts/metrics-constants";
import { useDynamicDasharray } from "@/components/charts/use-dynamic-dasharray";
import { TableEmptyState } from "@/components/table/table-empty-state";
import { Chart } from "@/components/ui/composables/chart";
import {
	chartAxisTickDefault,
	chartAxisYWidthCompact,
	chartCartesianGridDefault,
	chartTooltipHeaderRowClassName,
	chartTooltipMultiShellClassName,
	chartSeriesColorAtIndex,
} from "@/lib/chart-presentation";
import { cn } from "@/lib/utils";
import {
	ArrowCounterClockwiseIcon,
	ChartBarIcon,
	ChartLineUpIcon,
	LightningIcon,
	ListBulletsIcon,
} from "@databuddy/ui/icons";
import { Badge, Button, SegmentedControl } from "@databuddy/ui";

const {
	Area,
	Bar,
	CartesianGrid,
	ComposedChart,
	Customized,
	ReferenceArea,
	Tooltip,
	XAxis,
	YAxis,
} = Chart.Recharts;

const ResponsiveContainer = dynamic(
	() =>
		import("@/components/ui/composables/chart").then(
			(mod) => mod.Chart.Recharts.ResponsiveContainer
		),
	{ ssr: false }
);

const EVENTS_COLOR = METRIC_COLORS.pageviews.primary;
const USERS_COLOR = METRIC_COLORS.visitors.primary;
const CHART_HEIGHT = 260;

type ChartMode = "aggregate" | "by-event";
type ChartType = "area" | "bar";

interface EventsTrendChartProps {
	chartData: Array<{ date: string; events: number; users: number }>;
	eventNames?: string[];
	isFetching?: boolean;
	isLoading?: boolean;
	perEventData?: Record<string, string | number>[];
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
		color: string;
		dataKey: string;
		name: string;
		value: number;
	}>;
	label?: string;
	resolveColor?: (entry: { color: string; dataKey: string }) => string;
}) {
	if (!(active && payload?.length)) {
		return null;
	}

	const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

	return (
		<div className={chartTooltipMultiShellClassName}>
			{label && (
				<div className={chartTooltipHeaderRowClassName}>
					<div className="size-1.5 shrink-0 rounded-full bg-chart-1" />
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

const TOOLTIP_WRAPPER = {
	outline: "none",
	pointerEvents: "auto",
	zIndex: 10,
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
	},
	{
		value: "by-event" as const,
		label: (
			<>
				<ListBulletsIcon className="size-3.5" weight="duotone" />
				<span className="hidden sm:inline">By Event</span>
			</>
		),
	},
];

const CHART_TYPE_OPTIONS = [
	{
		value: "area" as const,
		label: <ChartLineUpIcon className="size-3.5" weight="duotone" />,
	},
	{
		value: "bar" as const,
		label: <ChartBarIcon className="size-3.5" weight="duotone" />,
	},
];

function aggregateColorResolver(entry: { dataKey: string }) {
	return entry.dataKey === "events" ? EVENTS_COLOR : USERS_COLOR;
}

function getEventColor(eventNames: string[], dataKey: string) {
	const index = eventNames.indexOf(dataKey);
	return chartSeriesColorAtIndex(index);
}

interface EventSeriesLegendProps {
	eventNames: string[];
	hiddenEvents: Set<string>;
	onReset: () => void;
	onToggle: (eventName: string) => void;
}

function EventSeriesLegend({
	eventNames,
	hiddenEvents,
	onReset,
	onToggle,
}: EventSeriesLegendProps) {
	const hiddenCount = eventNames.filter((eventName) =>
		hiddenEvents.has(eventName)
	).length;
	const visibleCount = eventNames.length - hiddenCount;

	return (
		<div className="border-border/60 border-t bg-card px-3 py-2.5">
			<div className="flex min-h-6 items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="font-medium text-foreground text-xs">Series</span>
					<span className="text-muted-foreground text-xs tabular-nums">
						{visibleCount}/{eventNames.length} visible
					</span>
				</div>
				{hiddenCount > 0 && (
					<button
						className="h-6 rounded-md px-2 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
						onClick={onReset}
						type="button"
					>
						Show all
					</button>
				)}
			</div>
			<div className="-mx-1 mt-2 overflow-x-auto px-1">
				<div className="flex w-max min-w-full gap-1.5 pb-1">
					{eventNames.map((eventName, index) => {
						const isHidden = hiddenEvents.has(eventName);
						const color = chartSeriesColorAtIndex(index);

						return (
							<button
								aria-pressed={!isHidden}
								className={cn(
									"inline-flex h-7 max-w-48 shrink-0 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2 text-xs transition-colors",
									isHidden
										? "text-muted-foreground/60 opacity-55 hover:bg-accent/40 hover:opacity-80"
										: "text-muted-foreground hover:bg-accent hover:text-foreground"
								)}
								key={eventName}
								onClick={() => onToggle(eventName)}
								title={eventName}
								type="button"
							>
								<span
									className={cn(
										"size-2 shrink-0 rounded-full",
										isHidden && "opacity-45"
									)}
									style={{ backgroundColor: color }}
								/>
								<span className={cn("truncate", isHidden && "line-through")}>
									{eventName}
								</span>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}

function AggregateLegend() {
	const items = [
		{ label: "Events", color: EVENTS_COLOR },
		{ label: "Users", color: USERS_COLOR },
	];

	return (
		<div className="border-border/60 border-t bg-card px-3 py-2.5">
			<div className="flex flex-wrap items-center justify-end gap-1.5">
				{items.map((item) => (
					<div
						className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2"
						key={item.label}
					>
						<span
							className="size-2 shrink-0 rounded-full"
							style={{ backgroundColor: item.color }}
						/>
						<span className="text-muted-foreground text-xs">{item.label}</span>
					</div>
				))}
			</div>
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

	const handleMouseDown = (event: { activeLabel?: string }) => {
		if (!event?.activeLabel) {
			return;
		}
		setRefAreaLeft(event.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (event: { activeLabel?: string }) => {
		if (!(refAreaLeft && event?.activeLabel)) {
			return;
		}
		setRefAreaRight(event.activeLabel);
	};

	const handleMouseUp = () => {
		if (!refAreaLeft) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight ?? refAreaLeft;
		const source = isByEvent ? displayPerEventData : displayData;
		const leftIndex = source.findIndex((data) => data.date === refAreaLeft);
		const rightIndex = source.findIndex((data) => data.date === rightBoundary);

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
	const showAllEvents = useCallback(() => {
		setHiddenEvents(new Set());
	}, []);

	const totalEvents = displayData.reduce((sum, data) => sum + data.events, 0);
	const totalUsers = displayData.reduce((sum, data) => sum + data.users, 0);

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		chartType: "monotone",
		splitIndex: activeData.length - 2,
	});

	const resolveEventColor = useMemo(
		() => (entry: { dataKey: string }) =>
			getEventColor(eventNames, entry.dataKey),
		[eventNames]
	);

	if (isLoading) {
		return (
			<div className="rounded-xl bg-secondary p-1.5">
				<Chart className="overflow-hidden rounded-lg">
					<Chart.Header
						className="border-sidebar-border/60 bg-sidebar"
						descriptionClassName="text-sidebar-foreground/70"
						titleClassName="font-semibold text-base text-sidebar-foreground"
						description="Loading event trends"
						title="Events Trend"
					/>
					<Chart.Plot className="p-3 sm:p-4">
						<div className="h-[260px] w-full animate-pulse rounded bg-muted" />
					</Chart.Plot>
				</Chart>
			</div>
		);
	}

	if (!chartData.length) {
		return (
			<div className="rounded-xl bg-secondary p-1.5">
				<Chart className="overflow-hidden rounded-lg">
					<Chart.Header
						className="border-sidebar-border/60 bg-sidebar"
						descriptionClassName="text-sidebar-foreground/70"
						titleClassName="font-semibold text-base text-sidebar-foreground"
						description="No data available"
						title="Events Trend"
					/>
					<Chart.Plot className="p-4">
						<TableEmptyState
							description="Event trends will appear here when events are tracked."
							icon={<LightningIcon className="size-6 text-muted-foreground" />}
							title="No event trend data"
						/>
					</Chart.Plot>
				</Chart>
			</div>
		);
	}

	const useBar = isByEvent && chartType === "bar";

	return (
		<div className="rounded-xl bg-secondary p-1.5">
		<Chart className="overflow-hidden rounded-lg border-sidebar-border">
			<Chart.Header
				className="border-sidebar-border/60 bg-sidebar"
				descriptionClassName="text-sidebar-foreground/70"
				titleClassName="font-semibold text-base text-sidebar-foreground"
				description={
					isByEvent
						? "Events broken down by type"
						: "Event occurrences over time"
				}
				title="Events Trend"
			>
				<div className="flex flex-wrap items-center justify-end gap-1.5">
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
							variant="secondary"
						>
							<ArrowCounterClockwiseIcon className="size-3" weight="bold" />
							Reset
						</Button>
					)}
					{hasPerEventData ? (
						<>
							<SegmentedControl
								onChange={setChartMode}
								options={MODE_OPTIONS}
								size="sm"
								value={chartMode}
							/>
							<SegmentedControl
								disabled={!isByEvent}
								onChange={setChartType}
								options={CHART_TYPE_OPTIONS}
								size="sm"
								value={chartType}
							/>
						</>
					) : (
						<Badge size="sm" variant="muted">
							Drag to zoom
						</Badge>
					)}
				</div>
			</Chart.Header>

			{!isByEvent && (
				<div className="grid grid-cols-2 gap-3 border-b bg-muted/40 px-4 py-3">
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

			<Chart.Plot className="relative flex-1 overflow-hidden p-2">
				<div
					className="relative select-none"
					style={{ height: CHART_HEIGHT, minWidth: 300, width: "100%" }}
				>
					<ResponsiveContainer height="100%" width="100%">
						<ComposedChart
							className={useBar ? "events-bar-chart" : undefined}
							data={activeData}
							margin={{ bottom: 8, left: 0, right: 10, top: 10 }}
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
							<CartesianGrid {...chartCartesianGridDefault} />
							<XAxis
								axisLine={false}
								dataKey="date"
								dy={5}
								tick={chartAxisTickDefault}
								tickLine={false}
							/>
							<YAxis
								allowDecimals={false}
								axisLine={false}
								tick={chartAxisTickDefault}
								tickFormatter={formatYTick}
								tickLine={false}
								width={chartAxisYWidthCompact}
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
							{isByEvent &&
								eventNames.map((name, index) => {
									const color = chartSeriesColorAtIndex(index);
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
												lineDasharrays.find((line) => line.name === name)
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
										lineDasharrays.find((line) => line.name === "events")
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
										lineDasharrays.find((line) => line.name === "users")
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
			</Chart.Plot>

			{isByEvent ? (
				<EventSeriesLegend
					eventNames={eventNames}
					hiddenEvents={hiddenEvents}
					onReset={showAllEvents}
					onToggle={toggleEvent}
				/>
			) : (
				<AggregateLegend />
			)}

			<style>{`
				.events-bar-chart .recharts-bar {
					cursor: pointer;
					transition: opacity 150ms ease-out;
				}
				.events-bar-chart:has(.recharts-bar:hover) .recharts-bar:not(:hover) {
					opacity: 0.15;
				}
			`}</style>
		</Chart>
		</div>
	);
}
