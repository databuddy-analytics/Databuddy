import {
	ChartLineIcon,
	EyeIcon,
	EyeSlashIcon,
	NoteIcon,
	XIcon,
} from "@phosphor-icons/react";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
	ANNOTATION_STORAGE_KEYS,
	CHART_ANNOTATION_STYLES,
} from "@/lib/annotation-constants";
import { isSingleDayAnnotation } from "@/lib/annotation-utils";
import dayjs from "@/lib/dayjs";
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
import { useDynamicDasharray } from "./use-dynamic-dasharray";

interface TooltipPayloadEntry {
	dataKey: string;
	value: number;
	color: string;
	payload: Record<string, unknown>;
}

interface TooltipProps {
	active?: boolean;
	payload?: TooltipPayloadEntry[];
	label?: string;
	isDragging?: boolean;
	justFinishedDragging?: boolean;
}

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
				<div className="h-1.5 w-1.5 animate-pulse rounded-full bg-chart-1" />
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

interface DateRangeState {
	startDate: Date;
	endDate: Date;
}

const EMPTY_ANNOTATIONS: Annotation[] = [];

interface MetricsChartProps {
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
}

function formatAxisTickLabel(
	value: string,
	granularity: MetricsChartProps["granularity"]
): string {
	const parsed = dayjs(value);
	if (!parsed.isValid()) {
		return value;
	}
	if (granularity === "hourly") {
		return parsed.format("MMM D, h:mm A");
	}
	return parsed.format("MMM D, YYYY");
}

const DEFAULT_METRICS = [
	"pageviews",
	"sessions",
	"visitors",
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
	annotations = EMPTY_ANNOTATIONS,
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

	const [isDragging, setIsDragging] = useState(false);
	const [suppressTooltip, setSuppressTooltip] = useState(false);
	const [hasAnimated, setHasAnimated] = useState(false);

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

	const chartData = useMemo(
		() =>
			rawData.map((row) => {
				const raw = (row as ChartDataRow & { rawDate?: string }).rawDate;
				const xKey = typeof raw === "string" && raw.length > 0 ? raw : row.date;
				return { ...row, xKey };
			}),
		[rawData]
	);

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
		setIsDragging(true);
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
		setIsDragging((wasDragging) => {
			if (wasDragging) {
				setTimeout(() => setSuppressTooltip(false), 150);
			}
			return false;
		});

		if (!(e?.activeLabel && refAreaLeft)) {
			setRefAreaLeft(null);
			setRefAreaRight(null);
			return;
		}

		const rightBoundary = refAreaRight || refAreaLeft;
		const leftIndex = chartData.findIndex((d) => d.xKey === refAreaLeft);
		const rightIndex = chartData.findIndex((d) => d.xKey === rightBoundary);

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
		return (
			<SkeletonChart className={cn("w-full", className)} height={height} />
		);
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
							<ChartLineIcon className="size-6 text-foreground" />
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
					{/* Annotations controls — overlaid top-right */}
					{annotations.length > 0 && (
						<div className="absolute top-2 right-3 z-10 flex items-center gap-1">
							{onToggleAnnotations !== undefined && (
								<Button
									aria-label={
										showAnnotations ? "Hide annotations" : "Show annotations"
									}
									className="size-7 text-muted-foreground hover:text-foreground"
									onClick={() => onToggleAnnotations(!showAnnotations)}
									size="icon"
									variant="ghost"
								>
									{showAnnotations ? (
										<EyeIcon className="size-3.5" />
									) : (
										<EyeSlashIcon className="size-3.5" />
									)}
								</Button>
							)}
							<AnnotationsPanel
								annotations={annotations}
								granularity={granularity}
								onDelete={onDeleteAnnotation || (async () => {})}
								onEdit={onEditAnnotation || (() => {})}
							/>
						</div>
					)}

					{/* Drag instruction pill */}
					{refAreaLeft !== null && refAreaRight === null && (
						<div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
							<div className="rounded bg-foreground px-2.5 py-1 font-medium text-background text-xs shadow-lg">
								Drag to select range
							</div>
						</div>
					)}

					{/* Onboarding tip */}
					{!refAreaLeft && annotations.length === 0 && !tipDismissed && (
						<div className="absolute top-2 right-3 z-10">
							<button
								className="flex items-center gap-1.5 rounded border bg-card/90 px-2 py-1 text-muted-foreground text-xs shadow-sm backdrop-blur-sm hover:text-foreground"
								onClick={() => setTipDismissed(true)}
								type="button"
							>
								<NoteIcon className="size-3" weight="duotone" />
								<span>Drag to annotate</span>
								<XIcon className="size-2.5" />
							</button>
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
								dataKey="xKey"
								tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
								tickFormatter={(value) =>
									formatAxisTickLabel(String(value), granularity)
								}
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
										isDragging={isDragging}
										justFinishedDragging={suppressTooltip}
									/>
								}
								cursor={
									suppressTooltip
										? false
										: {
												stroke: "var(--color-chart-1)",
												strokeDasharray: "4 4",
												strokeOpacity: 0.5,
											}
								}
								labelFormatter={(value) =>
									formatAxisTickLabel(String(value), granularity)
								}
							/>
							{refAreaLeft !== null && refAreaRight !== null && (
								<ReferenceArea
									fill="var(--color-chart-1)"
									fillOpacity={0.2}
									stroke="var(--color-chart-1)"
									strokeOpacity={0.6}
									strokeWidth={1}
									x1={refAreaLeft}
									x2={refAreaRight}
								/>
							)}

							{showAnnotations === true &&
								annotations.map((annotation, index) => {
									if (!chartData.length) {
										return null;
									}

									const chartFirst = chartData[0];
									const chartLast = chartData.at(-1);
									if (!(chartFirst && chartLast)) {
										return null;
									}

									const isHourlyBucket = granularity === "hourly";

									const rangeStart = isHourlyBucket
										? dayjs(annotation.xValue).toDate()
										: dayjs(annotation.xValue).startOf("day").toDate();
									const rangeEnd = isHourlyBucket
										? dayjs(annotation.xEndValue || annotation.xValue).toDate()
										: dayjs(annotation.xEndValue || annotation.xValue)
												.endOf("day")
												.toDate();

									const chartFirstD = dayjs(
										(chartFirst as ChartDataRow & { rawDate?: string })
											.rawDate || chartFirst.date
									);
									const chartLastD = dayjs(
										(chartLast as ChartDataRow & { rawDate?: string })
											.rawDate || chartLast.date
									);

									const chartDomainStart = isHourlyBucket
										? chartFirstD.toDate()
										: chartFirstD.startOf("day").toDate();
									const chartDomainEnd = isHourlyBucket
										? chartLastD.toDate()
										: chartLastD.endOf("day").toDate();

									if (
										rangeEnd < chartDomainStart ||
										rangeStart > chartDomainEnd
									) {
										return null;
									}

									let clampedStart = chartFirst.xKey;
									for (const point of chartData) {
										const pointDate = dayjs(
											(point as ChartDataRow & { rawDate?: string }).rawDate ||
												point.date
										).toDate();
										const pointCompare = isHourlyBucket
											? pointDate
											: dayjs(pointDate).startOf("day").toDate();
										const startCompare = isHourlyBucket
											? rangeStart
											: dayjs(rangeStart).startOf("day").toDate();
										if (pointCompare >= startCompare) {
											clampedStart = point.xKey;
											break;
										}
									}

									let clampedEnd = chartLast.xKey;
									for (let i = chartData.length - 1; i >= 0; i--) {
										const point = chartData[i];
										if (!point) {
											continue;
										}
										const pointDate = dayjs(
											(point as ChartDataRow & { rawDate?: string }).rawDate ||
												point.date
										).toDate();
										const pointCompare = isHourlyBucket
											? pointDate
											: dayjs(pointDate).startOf("day").toDate();
										const endCompare = isHourlyBucket
											? rangeEnd
											: dayjs(rangeEnd).startOf("day").toDate();
										if (pointCompare <= endCompare) {
											clampedEnd = point.xKey;
											break;
										}
									}

									if (
										annotation.annotationType === "range" &&
										annotation.xEndValue
									) {
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
													x={clampedStart}
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
												x1={clampedStart}
												x2={clampedEnd}
											/>
										);
									}

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
											x={clampedStart}
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
														? "text-muted-foreground line-through opacity-50"
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
									isAnimationActive={!hasAnimated}
									key={metric.key}
									name={metric.label}
									onAnimationEnd={() => {
										setHasAnimated(true);
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
