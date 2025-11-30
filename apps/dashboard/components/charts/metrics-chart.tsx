import { ChartLineIcon, XIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Legend,
	ReferenceArea,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
	ANNOTATION_STORAGE_KEYS,
	CHART_ANNOTATION_STYLES,
} from "@/lib/annotation-constants";
import {
	getChartDisplayDate,
	isSingleDayAnnotation,
} from "@/lib/annotation-utils";
import { cn } from "@/lib/utils";
import {
	metricVisibilityAtom,
	toggleMetricAtom,
} from "@/stores/jotai/chartAtoms";
import type { Annotation } from "@/types/annotations";
import { AnnotationsPanel } from "./annotations-panel";
import {
	type ChartDataRow,
	METRICS,
	type MetricConfig,
} from "./metrics-constants";
import { RangeSelectionPopup } from "./range-selection-popup";
import { SkeletonChart } from "./skeleton-chart";

const CustomTooltip = ({ active, payload, label }: any) => {
	if (!(active && payload?.length)) {
		return null;
	}

	return (
		<div className="min-w-[200px] rounded border border-sidebar-border bg-sidebar p-4 shadow-sm">
			<div className="mb-3 flex items-center gap-2 border-sidebar-border border-b pb-2">
				<div className="h-2 w-2 animate-pulse rounded-full bg-sidebar-ring" />
				<p className="font-semibold text-sidebar-foreground text-sm">{label}</p>
			</div>
			<div className="space-y-2.5">
				{Object.entries(
					payload.reduce((groups: any, entry: any) => {
						const key = entry.dataKey
							.replace("_historical", "")
							.replace("_future", "");
						if (!groups[key] || entry.dataKey.includes("_future")) {
							groups[key] = entry;
						}
						return groups;
					}, {})
				).map(([key, entry]: [string, any]) => {
					const metric = METRICS.find((m) => m.key === key);
					if (!metric) {
						return null;
					}

					const value = metric.formatValue
						? metric.formatValue(entry.value, entry.payload)
						: entry.value.toLocaleString();

					return (
						<div className="flex items-center justify-between gap-3" key={key}>
							<div className="flex items-center gap-2.5">
								<div
									className="h-3 w-3 rounded-full"
									style={{ backgroundColor: entry.color }}
								/>
								<span className="text-sidebar-foreground/70 text-xs">
									{metric.label}
								</span>
							</div>
							<span className="font-bold text-sidebar-foreground text-sm">
								{value}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
};

type DateRangeState = {
	startDate: Date;
	endDate: Date;
};

type MetricsChartProps = {
	data: ChartDataRow[] | undefined;
	isLoading: boolean;
	height?: number;
	title?: string;
	description?: string;
	className?: string;
	metricsFilter?: (metric: MetricConfig) => boolean;
	showLegend?: boolean;
	onRangeSelect?: (dateRange: DateRangeState) => void;
	onCreateAnnotation?: (annotation: {
		annotationType: "range";
		xValue: string;
		xEndValue: string;
		text: string;
		tags: string[];
		color: string;
		isPublic: boolean;
	}) => Promise<void> | void;
	annotations?: Annotation[];
	onEditAnnotation?: (annotation: Annotation) => void;
	onDeleteAnnotation?: (id: string) => Promise<void>;
	showAnnotations?: boolean;
	onToggleAnnotations?: (show: boolean) => void;
	websiteId?: string;
	granularity?: "hourly" | "daily" | "weekly" | "monthly";
};

export function MetricsChart({
	data,
	isLoading,
	height = 550,
	title,
	description,
	className,
	metricsFilter,
	showLegend = true,
	onRangeSelect,
	onCreateAnnotation,
	annotations = [],
	onEditAnnotation,
	onDeleteAnnotation,
	showAnnotations = true,
	onToggleAnnotations,
	websiteId,
	granularity = "daily",
}: MetricsChartProps) {
	const rawData = data || [];
	const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
	const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
	const [showRangePopup, setShowRangePopup] = useState(false);
	const [selectedDateRange, setSelectedDateRange] =
		useState<DateRangeState | null>(null);

	const [tipDismissed, setTipDismissed] = usePersistentState(
		websiteId
			? ANNOTATION_STORAGE_KEYS.tipDismissed(websiteId)
			: "chart-tip-dismissed",
		false
	);

	const [visibleMetrics] = useAtom(metricVisibilityAtom);
	const [, toggleMetric] = useAtom(toggleMetricAtom);

	const hiddenMetrics = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(visibleMetrics).map(([key, visible]) => [key, !visible])
			),
		[visibleMetrics]
	);

	const DEFAULT_METRICS = [
		"pageviews",
		"visitors",
		"sessions",
		"bounce_rate",
		"avg_session_duration",
	];

	const metrics = metricsFilter
		? METRICS.filter(metricsFilter)
		: METRICS.filter((metric) => DEFAULT_METRICS.includes(metric.key));

	const chartData = rawData.map((item, index) => {
		const isLastPoint = index === rawData.length - 1;
		const isSecondToLast = index === rawData.length - 2;

		const result = { ...item };
		for (const metric of metrics) {
			result[`${metric.key}_historical`] = isLastPoint
				? null
				: item[metric.key];
			if (isLastPoint || isSecondToLast) {
				result[`${metric.key}_future`] = item[metric.key];
			}
		}
		return result;
	});

	const handleMouseDown = (e: any) => {
		if (!e?.activeLabel) {
			return;
		}
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: any) => {
		if (!(refAreaLeft && e?.activeLabel)) {
			return;
		}
		setRefAreaRight(e.activeLabel);
	};

	const handleMouseUp = (e: any) => {
		if (!e?.activeLabel) {
			return;
		}
		if (!refAreaLeft) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight || refAreaLeft;

		const leftIndex = chartData.findIndex((d) => d.date === refAreaLeft);
		const rightIndex = chartData.findIndex((d) => d.date === rightBoundary);

		if (leftIndex === -1 || rightIndex === -1) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const [startIndex, endIndex] =
			leftIndex < rightIndex
				? [leftIndex, rightIndex]
				: [rightIndex, leftIndex];

		const startDateStr =
			(chartData[startIndex] as any).rawDate || chartData[startIndex].date;
		const endDateStr =
			(chartData[endIndex] as any).rawDate || chartData[endIndex].date;

		const startDate = dayjs(startDateStr).toDate();
		const endDate = dayjs(endDateStr).toDate();

		const dateRange = {
			startDate,
			endDate,
		};

		setSelectedDateRange(dateRange);
		setShowRangePopup(true);

		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	const handleZoom = (dateRange: DateRangeState) => {
		if (onRangeSelect) {
			onRangeSelect(dateRange);
		}
	};

	const handleCreateAnnotation = (annotation: {
		annotationType: "range";
		xValue: string;
		xEndValue: string;
		text: string;
		tags: string[];
		color: string;
		isPublic: boolean;
	}) => {
		if (onCreateAnnotation) {
			onCreateAnnotation(annotation);
		}
	};

	if (isLoading) {
		return <SkeletonChart className="w-full" height={height} title={title} />;
	}

	if (!chartData.length) {
		return (
			<div
				className={cn(
					"w-full rounded border border-sidebar-border bg-card",
					className
				)}
			>
				<div className="flex items-center justify-center p-8">
					<div className="flex flex-col items-center py-12 text-center">
						<div className="relative flex size-12 items-center justify-center rounded-2xl bg-accent-foreground">
							<ChartLineIcon className="size-6 text-accent" />
							<div className="absolute inset-0 rounded-full bg-linear-to-br from-sidebar-ring/10 to-transparent blur-xl" />
						</div>
						<p className="mt-6 font-medium text-lg text-sidebar-foreground">
							No data available
						</p>
						<p className="mx-auto max-w-sm text-sidebar-foreground/70 text-sm">
							Your analytics data will appear here as visitors interact with
							your website
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={cn("w-full overflow-hidden rounded", className)}>
			{/* Annotations Panel */}
			{annotations.length > 0 && (
				<div className="flex items-center justify-between border-sidebar-border border-b bg-sidebar px-4 py-2">
					<div className="flex items-center gap-3">
						<span className="text-sidebar-foreground/70 text-sm">
							{annotations.length} annotation
							{annotations.length !== 1 ? "s" : ""} on this chart
						</span>
						{onToggleAnnotations && (
							<div className="flex items-center gap-2">
								<Label
									className="text-sidebar-foreground/70 text-xs"
									htmlFor="show-annotations"
								>
									Show annotations
								</Label>
								<Switch
									checked={showAnnotations}
									id="show-annotations"
									onCheckedChange={onToggleAnnotations}
								/>
							</div>
						)}
					</div>
					<AnnotationsPanel
						annotations={annotations}
						granularity={granularity}
						onDelete={onDeleteAnnotation || (async () => {})}
						onEdit={onEditAnnotation || (() => {})}
					/>
				</div>
			)}

			<div className="p-0">
				<div
					className="relative select-none"
					style={{
						width: "100%",
						height: height + 20,
						userSelect: refAreaLeft ? "none" : "auto",
						WebkitUserSelect: refAreaLeft ? "none" : "auto",
					}}
				>
					{/* Range Selection Instructions */}
					{refAreaLeft && !refAreaRight && (
						<div className="-translate-x-1/2 absolute top-4 left-1/2 z-10 transform">
							<div className="rounded bg-sidebar-ring px-3 py-1 font-medium text-sidebar-foreground text-xs shadow-sm">
								Drag to select range or click to annotate this point
							</div>
						</div>
					)}

					{!refAreaLeft && annotations.length === 0 && !tipDismissed && (
						<div className="absolute top-4 right-4 z-10">
							<div className="flex items-center gap-2 rounded border border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground/70 text-xs shadow-sm">
								<span>💡 Click or drag on chart to create annotations</span>
								<button
									aria-label="Dismiss tip"
									className="text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground"
									onClick={() => setTipDismissed(true)}
									type="button"
								>
									<XIcon size={12} />
								</button>
							</div>
						</div>
					)}
					<ResponsiveContainer height="100%" width="100%">
						<ComposedChart
							data={chartData}
							margin={{
								top: 30,
								right: 30,
								left: 20,
								bottom: chartData.length > 5 ? 60 : 20,
							}}
							onMouseDown={handleMouseDown}
							onMouseMove={handleMouseMove}
							onMouseUp={handleMouseUp}
						>
							<defs>
								{metrics.map((metric) => (
									<linearGradient
										id={`gradient-${metric.gradient}`}
										key={metric.key}
										x1="0"
										x2="0"
										y1="0"
										y2="1"
									>
										<stop
											offset="0%"
											stopColor={metric.color}
											stopOpacity={0.3}
										/>
										<stop
											offset="100%"
											stopColor={metric.color}
											stopOpacity={0.02}
										/>
									</linearGradient>
								))}
							</defs>
							<CartesianGrid
								stroke="var(--sidebar-border)"
								strokeDasharray="2 4"
								strokeOpacity={0.3}
								vertical={false}
							/>
							<XAxis
								axisLine={false}
								dataKey="date"
								tick={{ fontSize: 11, fill: "oklch(0.4 0.01 240)" }}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={{ fontSize: 11, fill: "oklch(0.4 0.01 240)" }}
								tickLine={false}
								width={45}
							/>
							<Tooltip
								content={<CustomTooltip />}
								cursor={{
									stroke: "var(--sidebar-ring)",
									strokeDasharray: "4 4",
								}}
							/>
							{refAreaLeft && refAreaRight && (
								<ReferenceArea
									fill="var(--sidebar-ring)"
									fillOpacity={0.15}
									strokeOpacity={0.3}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}

							{showAnnotations &&
								annotations.map((annotation, index) => {
									const startDate = getChartDisplayDate(
										annotation.xValue,
										granularity
									);

									if (
										annotation.annotationType === "range" &&
										annotation.xEndValue
									) {
										const endDate = getChartDisplayDate(
											annotation.xEndValue,
											granularity
										);

										const isSingleDay = isSingleDayAnnotation(annotation);

										if (isSingleDay) {
											return (
												<ReferenceLine
													key={annotation.id}
													label={{
														value: annotation.text,
														position: index % 2 === 0 ? "top" : "insideTopLeft",
														fill: annotation.color,
														fontSize: CHART_ANNOTATION_STYLES.fontSize,
														fontWeight: CHART_ANNOTATION_STYLES.fontWeight,
														offset: CHART_ANNOTATION_STYLES.offset,
													}}
													stroke={annotation.color}
													strokeDasharray={
														CHART_ANNOTATION_STYLES.strokeDasharray
													}
													strokeWidth={CHART_ANNOTATION_STYLES.strokeWidth}
													x={startDate}
												/>
											);
										}

										return (
											<ReferenceArea
												fill={annotation.color}
												fillOpacity={CHART_ANNOTATION_STYLES.fillOpacity}
												key={annotation.id}
												label={{
													value: annotation.text,
													position: index % 2 === 0 ? "top" : "insideTop",
													fill: annotation.color,
													fontSize: CHART_ANNOTATION_STYLES.fontSize,
													fontWeight: CHART_ANNOTATION_STYLES.fontWeight,
													offset: CHART_ANNOTATION_STYLES.offset,
												}}
												stroke={annotation.color}
												strokeDasharray="3 3"
												strokeOpacity={CHART_ANNOTATION_STYLES.strokeOpacity}
												strokeWidth={2}
												x1={startDate}
												x2={endDate}
											/>
										);
									}

									// Point or line annotations
									return (
										<ReferenceLine
											key={annotation.id}
											label={{
												value: annotation.text,
												position: index % 2 === 0 ? "top" : "insideTopLeft",
												fill: annotation.color,
												fontSize: CHART_ANNOTATION_STYLES.fontSize,
												fontWeight: CHART_ANNOTATION_STYLES.fontWeight,
												offset: CHART_ANNOTATION_STYLES.offset,
											}}
											stroke={annotation.color}
											strokeDasharray={CHART_ANNOTATION_STYLES.strokeDasharray}
											strokeWidth={CHART_ANNOTATION_STYLES.strokeWidth}
											x={startDate}
										/>
									);
								})}

							{showLegend && (
								<Legend
									align="center"
									formatter={(label) => {
										const metric = metrics.find((m) => m.label === label);
										const isHidden = metric && hiddenMetrics[metric.key];
										return (
											<span
												className={`cursor-pointer text-xs ${
													isHidden
														? "text-muted-foreground/50 line-through"
														: "text-muted-foreground hover:text-foreground"
												}`}
											>
												{label}
											</span>
										);
									}}
									onClick={(payload: any) => {
										const metric = metrics.find(
											(m) => m.label === payload.value
										);
										if (metric) {
											toggleMetric(metric.key as keyof typeof visibleMetrics);
										}
									}}
									verticalAlign="bottom"
									wrapperStyle={{ paddingTop: "20px", fontSize: "12px" }}
								/>
							)}
							{metrics.map((metric) => (
								<Area
									activeDot={{ r: 4, stroke: metric.color, strokeWidth: 2 }}
									dataKey={`${metric.key}_historical`}
									fill={`url(#gradient-${metric.gradient})`}
									hide={hiddenMetrics[metric.key]}
									key={metric.key}
									name={metric.label}
									stroke={metric.color}
									strokeWidth={2.5}
									type="monotone"
								/>
							))}
							{metrics.map((metric) => (
								<Area
									connectNulls={false}
									dataKey={`${metric.key}_future`}
									dot={false}
									fill={`url(#gradient-${metric.gradient})`}
									hide={hiddenMetrics[metric.key]}
									key={`future-${metric.key}`}
									legendType="none"
									stroke={metric.color}
									strokeDasharray="4 4"
									strokeOpacity={0.8}
									strokeWidth={2}
									type="monotone"
								/>
							))}
						</ComposedChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Range Selection Popup */}
			{showRangePopup && selectedDateRange && (
				<RangeSelectionPopup
					dateRange={selectedDateRange}
					isOpen={showRangePopup} // Position is handled by modal overlay
					onCloseAction={() => setShowRangePopup(false)}
					onCreateAnnotationAction={handleCreateAnnotation}
					onZoomAction={handleZoom}
					position={{ x: 0, y: 0 }}
				/>
			)}
		</div>
	);
}
