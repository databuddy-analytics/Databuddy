import { ChartLineIcon, XIcon } from "@phosphor-icons/react";
import dayjs from "dayjs";
import { useAtom } from "jotai";
import { useCallback, useRef, useState } from "react";
import {
	Area,
	CartesianGrid,
	ComposedChart,
	Customized,
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
import { useChartPreferences } from "@/hooks/use-chart-preferences";
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
import { AnnotationModal } from "./annotation-modal";
import { AnnotationsPanel } from "./annotations-panel";
import {
	type ChartDataRow,
	METRICS,
	type MetricConfig,
} from "./metrics-constants";
import { RangeSelectionPopup } from "./range-selection-popup";
import { SkeletonChart } from "./skeleton-chart";

type TooltipPayloadEntry = {
	dataKey: string;
	value: number;
	color: string;
	payload: Record<string, unknown>;
};

type TooltipProps = {
	active?: boolean;
	payload?: TooltipPayloadEntry[];
	label?: string;
	isDragging?: boolean;
	justFinishedDragging?: boolean;
};

const CustomTooltip = ({
	active,
	payload,
	label,
	isDragging,
	justFinishedDragging,
}: TooltipProps) => {
	// Hide tooltip during or immediately after dragging
	if (isDragging || justFinishedDragging) {
		return null;
	}

	if (!(active && payload?.length)) {
		return null;
	}

	return (
		<div className="min-w-[200px] rounded border bg-popover p-3 shadow-lg">
			<div className="mb-2 flex items-center gap-2 border-b pb-2">
				<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
				<p className="font-medium text-foreground text-xs">{label}</p>
			</div>
			<div className="space-y-1.5">
				{payload.map((entry) => {
					const metric = METRICS.find((m) => m.key === entry.dataKey);
					if (!metric || entry.value === undefined || entry.value === null) {
						return null;
					}

					const value = metric.formatValue
						? metric.formatValue(entry.value, entry.payload as ChartDataRow)
						: entry.value.toLocaleString();

					return (
						<div
							className="flex items-center justify-between gap-3"
							key={entry.dataKey}
						>
							<div className="flex items-center gap-2">
								<div
									className="size-2.5 rounded-full"
									style={{ backgroundColor: entry.color }}
								/>
								<span className="text-muted-foreground text-xs">
									{metric.label}
								</span>
							</div>
							<span className="font-semibold text-foreground text-sm tabular-nums">
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

type ChartDataPoint = {
	x?: number;
	y?: number;
	value?: number | string;
	payload?: Record<string, unknown>;
};

type ChartLineData = {
	item: {
		props: {
			dataKey: string;
		};
	};
	props: {
		points: ChartDataPoint[];
	};
};

type CustomizedChartProps = {
	formattedGraphicalItems?: ChartLineData[];
};

type LineConfig = {
	name: string;
	splitIndex?: number;
	dashPattern?: number[];
	curveAdjustment?: number;
};

type UseDynamicDasharrayProps = {
	lineConfigs?: LineConfig[];
	splitIndex?: number;
	defaultDashPattern?: number[];
	curveAdjustment?: number;
	chartType?:
		| "linear"
		| "monotone"
		| "natural"
		| "step"
		| "stepBefore"
		| "stepAfter";
};

type LineDasharray = {
	name: string;
	strokeDasharray: string;
}[];

function useDynamicDasharray({
	lineConfigs = [],
	splitIndex = -2,
	defaultDashPattern: dashPattern = [5, 3],
	curveAdjustment = 1,
	chartType = "linear",
}: UseDynamicDasharrayProps): [
	(props: CustomizedChartProps) => null,
	LineDasharray,
] {
	const [lineDasharrays, setLineDasharrays] = useState<LineDasharray>([]);

	const DasharrayCalculator = useCallback(
		(props: CustomizedChartProps): null => {
			const chartLines = props?.formattedGraphicalItems;
			const newLineDasharrays: LineDasharray = [];

			const calculatePathLength = (points: ChartDataPoint[]) =>
				points?.reduce((total, point, index) => {
					if (index === 0) {
						return total;
					}

					const prevPoint = points[index - 1];

					const dx = Math.abs((point.x || 0) - (prevPoint.x || 0));
					const dy = Math.abs((point.y || 0) - (prevPoint.y || 0));

					// For step charts, calculate actual step path length (horizontal + vertical)
					if (
						chartType === "step" ||
						chartType === "stepBefore" ||
						chartType === "stepAfter"
					) {
						return total + dx + dy;
					}

					// For smooth curves, use Euclidean distance
					return total + Math.sqrt(dx * dx + dy * dy);
				}, 0) || 0;

			if (chartLines) {
				for (const line of chartLines) {
					const points = line?.props?.points;
					const totalLength = calculatePathLength(points || []);

					const lineName = line?.item?.props?.dataKey;
					const lineConfig = lineConfigs?.find(
						(config) => config?.name === lineName
					);
					const lineSplitIndex = lineConfig?.splitIndex ?? splitIndex;
					const dashedSegment = points?.slice(lineSplitIndex);
					const dashedLength = calculatePathLength(dashedSegment || []);

					if (
						totalLength === 0 ||
						dashedLength === 0 ||
						lineName === undefined
					) {
						continue;
					}

					const solidLength = totalLength - dashedLength;
					const curveCorrectionFactor =
						lineConfig?.curveAdjustment ?? curveAdjustment;
					const adjustment = (solidLength * curveCorrectionFactor) / 100;
					const solidDasharrayPart = solidLength + adjustment;

					const targetDashPattern = lineConfig?.dashPattern || dashPattern;
					const patternSegmentLength =
						(targetDashPattern?.[0] || 0) + (targetDashPattern?.[1] || 0) || 1;
					const repetitions = Math.ceil(dashedLength / patternSegmentLength);
					const dashedPatternSegments = Array.from(
						{ length: repetitions },
						() => targetDashPattern.join(" ")
					);

					const finalDasharray = `${solidDasharrayPart} ${dashedPatternSegments.join(
						" "
					)}`;
					newLineDasharrays.push({
						name: lineName,
						strokeDasharray: finalDasharray,
					});
				}
			}

			if (
				JSON.stringify(newLineDasharrays) !== JSON.stringify(lineDasharrays)
			) {
				setTimeout(() => setLineDasharrays(newLineDasharrays), 0);
			}

			return null;
		},
		[
			splitIndex,
			curveAdjustment,
			lineConfigs,
			dashPattern,
			lineDasharrays,
			chartType,
		]
	);

	return [DasharrayCalculator, lineDasharrays];
}

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

const DEFAULT_METRICS = [
	"pageviews",
	"visitors",
	"sessions",
	"bounce_rate",
	"median_session_duration",
];

export function MetricsChart({
	data,
	isLoading,
	height = 550,
	title,
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
	const [showAnnotationModal, setShowAnnotationModal] = useState(false);
	const [selectedDateRange, setSelectedDateRange] =
		useState<DateRangeState | null>(null);

	const isDraggingRef = useRef(false);
	const [suppressTooltip, setSuppressTooltip] = useState(false);
	const hasAnimatedRef = useRef(false);

	const { chartStepType } = useChartPreferences("overview-main");

	const [tipDismissed, setTipDismissed] = usePersistentState(
		websiteId
			? ANNOTATION_STORAGE_KEYS.tipDismissed(websiteId)
			: "chart-tip-dismissed",
		false
	);

	const [visibleMetrics] = useAtom(metricVisibilityAtom);
	const [, toggleMetric] = useAtom(toggleMetricAtom);

	const hiddenMetrics = Object.fromEntries(
		Object.entries(visibleMetrics).map(([key, visible]) => [key, !visible])
	);

	const metrics = metricsFilter
		? METRICS.filter(metricsFilter)
		: METRICS.filter((metric) => DEFAULT_METRICS.includes(metric.key));

	const chartData = rawData;

	const [DasharrayCalculator, lineDasharrays] = useDynamicDasharray({
		splitIndex: chartData.length - 2,
		chartType: chartStepType,
		curveAdjustment:
			chartStepType === "step" ||
			chartStepType === "stepBefore" ||
			chartStepType === "stepAfter"
				? 0
				: 1,
	});

	const handleMouseDown = (e: { activeLabel?: string }) => {
		if (!e?.activeLabel) {
			return;
		}
		isDraggingRef.current = true;
		setSuppressTooltip(true);
		setRefAreaLeft(e.activeLabel);
		setRefAreaRight(null);
	};

	const handleMouseMove = (e: { activeLabel?: string }) => {
		if (!(refAreaLeft && e?.activeLabel)) {
			return;
		}
		setRefAreaRight(e.activeLabel);
	};

	const handleMouseUp = (e: { activeLabel?: string }) => {
		const wasDragging = isDraggingRef.current;
		isDraggingRef.current = false;

		if (wasDragging) {
			setTimeout(() => setSuppressTooltip(false), 150);
		}

		if (!(e?.activeLabel && refAreaLeft)) {
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
			(chartData[startIndex] as ChartDataRow & { rawDate?: string }).rawDate ||
			chartData[startIndex].date;
		const endDateStr =
			(chartData[endIndex] as ChartDataRow & { rawDate?: string }).rawDate ||
			chartData[endIndex].date;

		setSelectedDateRange({
			startDate: dayjs(startDateStr).toDate(),
			endDate: dayjs(endDateStr).toDate(),
		});
		setShowRangePopup(true);
		setRefAreaLeft(null);
		setRefAreaRight(null);
	};

	const handleInternalCreateAnnotation = async (annotation: {
		annotationType: "range";
		xValue: string;
		xEndValue: string;
		text: string;
		tags: string[];
		color: string;
		isPublic: boolean;
	}) => {
		await onCreateAnnotation?.(annotation);
		setShowAnnotationModal(false);
	};

	if (isLoading) {
		return <SkeletonChart className="w-full" height={height} title={title} />;
	}

	if (!chartData.length) {
		return (
			<div
				className={cn(
					"w-full overflow-hidden rounded border bg-card",
					className
				)}
			>
				<div className="flex items-center justify-center p-8">
					<div className="flex flex-col items-center py-12 text-center">
						<div className="relative flex size-12 items-center justify-center rounded bg-accent">
							<ChartLineIcon className="size-6 text-muted-foreground" />
						</div>
						<p className="mt-6 font-medium text-foreground text-lg">
							No data available
						</p>
						<p className="mx-auto max-w-sm text-muted-foreground text-sm">
							Your analytics data will appear here as visitors interact with
							your website
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn("w-full overflow-hidden rounded border bg-card", className)}
		>
			{/* Annotations Panel */}
			{annotations.length > 0 && (
				<div className="flex items-center justify-between border-b bg-accent px-4 py-2">
					<div className="flex items-center gap-3">
						<span className="text-muted-foreground text-sm">
							{annotations.length} annotation
							{annotations.length !== 1 ? "s" : ""} on this chart
						</span>
						{onToggleAnnotations !== undefined && (
							<div className="flex items-center gap-2">
								<Label
									className="text-muted-foreground text-xs"
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
					{refAreaLeft !== null && refAreaRight === null && (
						<div className="-translate-x-1/2 absolute top-4 left-1/2 z-10 transform">
							<div className="rounded bg-primary px-3 py-1.5 font-medium text-primary-foreground text-xs shadow-lg">
								Drag to select range or click to annotate this point
							</div>
						</div>
					)}

					{!refAreaLeft && annotations.length === 0 && !tipDismissed && (
						<div className="absolute top-4 right-4 z-10">
							<div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-sm">
								<span className="text-muted-foreground text-xs">
									Click or drag on chart to create annotations
								</span>
								<button
									aria-label="Dismiss tip"
									className="text-muted-foreground hover:text-foreground"
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
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								tickLine={false}
							/>
							<YAxis
								axisLine={false}
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								tickLine={false}
								width={45}
							/>
							<Tooltip
								content={
									<CustomTooltip
										isDragging={isDraggingRef.current}
										justFinishedDragging={suppressTooltip}
									/>
								}
								cursor={
									suppressTooltip
										? false
										: {
												stroke: "var(--color-primary)",
												strokeDasharray: "4 4",
												strokeOpacity: 0.5,
											}
								}
							/>
							{refAreaLeft !== null && refAreaRight !== null && (
								<ReferenceArea
									fill="var(--color-primary)"
									fillOpacity={0.2}
									stroke="var(--color-primary)"
									strokeOpacity={0.6}
									strokeWidth={1}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}

							{showAnnotations === true &&
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

							{showLegend === true && (
								<Legend
									align="center"
									formatter={(label) => {
										const metric = metrics.find((m) => m.label === label);
										const isHidden = metric ? hiddenMetrics[metric.key] : false;
										return (
											<span
												className={`cursor-pointer text-xs ${
													isHidden
														? "text-muted line-through opacity-50"
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
									activeDot={
										suppressTooltip
											? false
											: { r: 4, stroke: metric.color, strokeWidth: 2 }
									}
									dataKey={metric.key}
									fill={`url(#gradient-${metric.gradient})`}
									hide={hiddenMetrics[metric.key]}
									isAnimationActive={!hasAnimatedRef.current}
									key={metric.key}
									name={metric.label}
									onAnimationEnd={() => {
										hasAnimatedRef.current = true;
									}}
									stroke={metric.color}
									strokeDasharray={
										lineDasharrays.find((line) => line.name === metric.key)
											?.strokeDasharray || "0 0"
									}
									strokeWidth={2.5}
									type={chartStepType}
								/>
							))}
							<Customized component={DasharrayCalculator} />
						</ComposedChart>
					</ResponsiveContainer>
				</div>
			</div>

			{/* Range Selection Popup */}
			{showRangePopup === true && selectedDateRange !== null && (
				<RangeSelectionPopup
					dateRange={selectedDateRange}
					isOpen={showRangePopup}
					onAddAnnotationAction={() => {
						setShowRangePopup(false);
						setShowAnnotationModal(true);
					}}
					onCloseAction={() => setShowRangePopup(false)}
					onZoomAction={onRangeSelect ?? (() => {})}
				/>
			)}

			{showAnnotationModal === true && selectedDateRange !== null && (
				<AnnotationModal
					dateRange={selectedDateRange}
					isOpen={showAnnotationModal}
					mode="create"
					onClose={() => setShowAnnotationModal(false)}
					onCreate={handleInternalCreateAnnotation}
				/>
			)}
		</div>
	);
}
