"use client";

import { EyeIcon } from "@phosphor-icons/react";
import { EyeSlashIcon } from "@phosphor-icons/react";
import { NoteIcon } from "@phosphor-icons/react";
import { XIcon } from "@phosphor-icons/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { WarningIcon } from "@phosphor-icons/react";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AnnotationModal } from "@/components/charts/annotation-modal";
import { AnnotationsPanel } from "@/components/charts/annotations-panel";
import {
	type ChartDataRow,
	METRICS,
} from "@/components/charts/metrics-constants";
import { RangeSelectionPopup } from "@/components/charts/range-selection-popup";
import { useDynamicDasharray } from "@/components/charts/use-dynamic-dasharray";
import { SectionBrandOverlay } from "@/components/logo/section-brand-overlay";
import { Button } from "@/components/ds/button";
import {
	Chart,
	type ChartInteractiveFeatures,
	mergeChartInteractiveFeatures,
} from "@/components/ui/composables/chart";
import { Skeleton } from "@/components/ds/skeleton";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
	ANNOTATION_STORAGE_KEYS,
	CHART_ANNOTATION_STYLES,
} from "@/lib/annotation-constants";
import { isSingleDayAnnotation } from "@/lib/annotation-utils";
import {
	chartAxisTickDefault,
	chartCartesianGridDefault,
	chartRechartsInteractiveLegendLabelClassName,
	chartRechartsLegendIconSize,
	chartRechartsLegendInteractiveWrapperStyle,
} from "@/lib/chart-presentation";
import { chartQueryOutcome } from "@/lib/chart-query-outcome";
import dayjs from "@/lib/dayjs";
import { formatLocaleNumber } from "@/lib/format-locale-number";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import {
	metricVisibilityAtom,
	toggleMetricAtom,
} from "@/stores/jotai/chartAtoms";
import type {
	Annotation,
	AnnotationFormData,
	ChartContext,
	CreateAnnotationData,
} from "@/types/annotations";
import type { DateRange } from "../../../utils/types";

const {
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
} = Chart.Recharts;

interface TooltipPayloadEntry {
	color: string;
	dataKey: string;
	payload: Record<string, unknown>;
	value: number;
}

interface TooltipProps {
	active?: boolean;
	isDragging?: boolean;
	justFinishedDragging?: boolean;
	label?: string;
	payload?: TooltipPayloadEntry[];
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
						: formatLocaleNumber(entry.value);

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
	endDate: Date;
	startDate: Date;
}

interface CreateAnnotationInput {
	annotationType: "range";
	color: string;
	isPublic: boolean;
	tags: string[];
	text: string;
	xEndValue: string;
	xValue: string;
}

interface TrafficTrendsRechartsPlotProps {
	className?: string;
	data: ChartDataRow[];
	dateRange: {
		endDate: Date;
		granularity: "hourly" | "daily" | "weekly" | "monthly";
		startDate: Date;
	};
	features?: ChartInteractiveFeatures;
	height: number;
	onRangeSelect?: (dateRange: DateRangeState) => void;
	websiteId: string;
}

function formatAxisTickLabel(
	value: string,
	granularity:
		| TrafficTrendsRechartsPlotProps["dateRange"]["granularity"]
		| undefined
): string {
	const parsed = dayjs(value);
	if (!parsed.isValid()) {
		return value;
	}
	const g = granularity ?? "daily";
	if (g === "hourly") {
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

export function TrafficTrendsRechartsPlot({
	className,
	data,
	dateRange,
	features: featuresProp,
	height,
	onRangeSelect,
	websiteId,
}: TrafficTrendsRechartsPlotProps) {
	const mergedFeatures = mergeChartInteractiveFeatures(featuresProp);
	const granularity = dateRange.granularity;

	const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(
		null
	);

	const [showAnnotations, setShowAnnotations] = usePersistentState(
		ANNOTATION_STORAGE_KEYS.visibility(websiteId),
		true
	);

	const createAnnotation = useMutation({
		...orpc.annotations.create.mutationOptions(),
	});
	const updateAnnotation = useMutation({
		...orpc.annotations.update.mutationOptions(),
	});
	const deleteAnnotation = useMutation({
		...orpc.annotations.delete.mutationOptions(),
	});

	const chartContext = useMemo((): ChartContext | null => {
		if (!(dateRange && data?.length)) {
			return null;
		}

		return {
			dateRange: {
				start_date: dateRange.startDate.toISOString(),
				end_date: dateRange.endDate.toISOString(),
				granularity: dateRange.granularity,
			},
			metrics: ["pageviews", "sessions", "visitors"],
		};
	}, [dateRange, data]);

	const { data: allAnnotations, refetch: refetchAnnotations } = useQuery({
		...orpc.annotations.list.queryOptions({
			input: {
				websiteId,
				chartContext: chartContext as ChartContext,
				chartType: "metrics" as const,
			},
		}),
		enabled: !!websiteId && !!chartContext,
	});

	const annotationsList = useMemo(() => {
		if (!(allAnnotations && dateRange)) {
			return [];
		}

		const { endDate, startDate } = dateRange;

		const effectiveEndDate = dayjs(endDate).endOf("day").toDate();

		return allAnnotations.filter((annotation) => {
			const annotationStart = new Date(annotation.xValue);
			const annotationEnd = annotation.xEndValue
				? new Date(annotation.xEndValue)
				: annotationStart;

			return annotationStart <= effectiveEndDate && annotationEnd >= startDate;
		});
	}, [allAnnotations, dateRange]);

	const closeEditModal = () => {
		setEditingAnnotation(null);
	};

	const handleCreateAnnotationRpc = async (
		annotation: CreateAnnotationInput
	) => {
		if (!(websiteId && chartContext)) {
			toast.error("Missing required data for annotation creation");
			return;
		}

		const createData: CreateAnnotationData = {
			websiteId,
			chartType: "metrics",
			chartContext,
			annotationType: annotation.annotationType,
			xValue: annotation.xValue,
			xEndValue: annotation.xEndValue,
			text: annotation.text,
			tags: annotation.tags,
			color: annotation.color,
			isPublic: annotation.isPublic,
		};

		const promise = createAnnotation.mutateAsync(createData);

		toast.promise(promise, {
			error: (err) => err?.message || "Failed to create annotation",
			loading: "Creating annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation created successfully!";
			},
		});

		await promise;
	};

	const handleEditAnnotation = (annotation: Annotation) => {
		setEditingAnnotation(annotation);
	};

	const handleDeleteAnnotation = async (id: string) => {
		const promise = deleteAnnotation.mutateAsync({ id });

		toast.promise(promise, {
			error: (err) => err?.message || "Failed to delete annotation",
			loading: "Deleting annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation deleted successfully";
			},
		});

		await promise;
	};

	const handleSaveAnnotation = async (
		id: string,
		updates: AnnotationFormData
	) => {
		const promise = updateAnnotation.mutateAsync({ id, ...updates });

		toast.promise(promise, {
			error: (err) => err?.message || "Failed to update annotation",
			loading: "Updating annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation updated successfully";
			},
		});

		await promise;
	};

	const annotations = (annotationsList || []) as Annotation[];

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

	const metrics = METRICS.filter((metric) =>
		DEFAULT_METRICS.includes(metric.key)
	);
	const showLegend = true;

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
		curveAdjustment: Chart.isStepCurve(chartStepType) ? 0 : 1,
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
		await handleCreateAnnotationRpc(annotation);
		setShowAnnotationModal(false);
	};

	if (!chartData.length) {
		return null;
	}

	return (
		<>
			<div className={cn("w-full overflow-hidden", className)}>
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
						{mergedFeatures.annotations && annotations.length > 0 && (
							<div className="absolute top-2 right-3 z-10 flex items-center gap-1">
								<Button
									aria-label={
										showAnnotations ? "Hide annotations" : "Show annotations"
									}
									className="size-7 text-muted-foreground hover:text-foreground"
									onClick={() => setShowAnnotations(!showAnnotations)}
									size="icon"
									type="button"
									variant="ghost"
								>
									{showAnnotations ? (
										<EyeIcon className="size-3.5" />
									) : (
										<EyeSlashIcon className="size-3.5" />
									)}
								</Button>
								<AnnotationsPanel
									annotations={annotations}
									granularity={granularity}
									onDelete={handleDeleteAnnotation}
									onEdit={handleEditAnnotation}
								/>
							</div>
						)}

						{mergedFeatures.rangeSelection &&
							refAreaLeft !== null &&
							refAreaRight === null && (
								<div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
									<div className="rounded bg-foreground px-2.5 py-1 font-medium text-background text-xs shadow-lg">
										Drag to select range
									</div>
								</div>
							)}

						{mergedFeatures.annotations &&
							mergedFeatures.rangeSelection &&
							!refAreaLeft &&
							annotations.length === 0 &&
							!tipDismissed && (
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
								onMouseDown={
									mergedFeatures.rangeSelection ? handleMouseDown : undefined
								}
								onMouseMove={
									mergedFeatures.rangeSelection ? handleMouseMove : undefined
								}
								onMouseUp={
									mergedFeatures.rangeSelection ? handleMouseUp : undefined
								}
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
								<CartesianGrid {...chartCartesianGridDefault} />
								<XAxis
									axisLine={false}
									dataKey="xKey"
									tick={chartAxisTickDefault}
									tickFormatter={(value) =>
										formatAxisTickLabel(String(value), granularity)
									}
									tickLine={false}
								/>
								<YAxis
									axisLine={false}
									tick={chartAxisTickDefault}
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
								{mergedFeatures.rangeSelection &&
									refAreaLeft !== null &&
									refAreaRight !== null && (
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

								{mergedFeatures.annotations &&
									showAnnotations === true &&
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
											? dayjs(
													annotation.xEndValue || annotation.xValue
												).toDate()
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
												(point as ChartDataRow & { rawDate?: string })
													.rawDate || point.date
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
												(point as ChartDataRow & { rawDate?: string })
													.rawDate || point.date
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
															position:
																index % 2 === 0 ? "top" : "insideTopLeft",
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
												strokeDasharray={
													CHART_ANNOTATION_STYLES.strokeDasharray
												}
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
											const isHidden = metric
												? hiddenMetrics[metric.key]
												: false;
											return (
												<span
													className={chartRechartsInteractiveLegendLabelClassName(
														isHidden
													)}
												>
													{label}
												</span>
											);
										}}
										iconSize={chartRechartsLegendIconSize}
										iconType="circle"
										onClick={(payload: { value?: string | number }) => {
											const metric = metrics.find(
												(m) => m.label === payload.value
											);
											if (metric) {
												toggleMetric(metric.key as keyof typeof visibleMetrics);
											}
										}}
										verticalAlign="bottom"
										wrapperStyle={chartRechartsLegendInteractiveWrapperStyle}
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

				{mergedFeatures.rangeSelection &&
					showRangePopup === true &&
					selectedDateRange !== null && (
						<RangeSelectionPopup
							dateRange={selectedDateRange}
							isOpen={showRangePopup}
							onAddAnnotationAction={() => {
								setShowRangePopup(false);
								setShowAnnotationModal(true);
							}}
							onCloseAction={() => setShowRangePopup(false)}
							onZoomAction={onRangeSelect ?? (() => {})}
							showAnnotationAction={mergedFeatures.annotations}
						/>
					)}

				{mergedFeatures.annotations &&
					mergedFeatures.rangeSelection &&
					showAnnotationModal === true &&
					selectedDateRange !== null && (
						<AnnotationModal
							dateRange={selectedDateRange}
							isOpen={showAnnotationModal}
							mode="create"
							onClose={() => setShowAnnotationModal(false)}
							onCreate={handleInternalCreateAnnotation}
						/>
					)}
			</div>

			{editingAnnotation ? (
				<AnnotationModal
					annotation={editingAnnotation}
					isOpen={true}
					isSubmitting={updateAnnotation.isPending}
					mode="edit"
					onClose={closeEditModal}
					onSubmit={handleSaveAnnotation}
				/>
			) : null}
		</>
	);
}

interface TrafficTrendsChartProps {
	chartData: ChartDataRow[];
	dateDiff: number;
	dateRange: DateRange;
	isError: boolean;
	isLoading: boolean;
	isMobile: boolean;
	onRangeSelect: (range: { startDate: Date; endDate: Date }) => void;
	websiteId: string;
}

export function TrafficTrendsChart({
	websiteId,
	dateRange,
	chartData,
	dateDiff,
	isError,
	isLoading,
	isMobile,
	onRangeSelect,
}: TrafficTrendsChartProps) {
	const outcome = useMemo(
		() =>
			chartQueryOutcome({
				data: chartData,
				isError,
				isPending: isLoading,
				isSuccess: !(isLoading || isError),
			}),
		[chartData, isError, isLoading]
	);

	const plotHeight = isMobile ? 250 : 350;
	/** Matches `TrafficTrendsRechartsPlot` plot wrapper (`height + 20`). */
	const plotRegionHeight = plotHeight + 20;

	return (
		<Chart className="gap-0 border-sidebar-border bg-sidebar py-0">
			<Chart.Header
				className="border-sidebar-border/60 px-3 py-2.5 sm:items-center sm:px-4 sm:py-3"
				description={
					<>
						<p className="text-xs sm:text-sm">
							{dateRange.granularity === "hourly" ? "Hourly" : "Daily"} traffic
							data
						</p>
						{dateRange.granularity === "hourly" && dateDiff > 7 ? (
							<div className="mt-1 flex items-start gap-1 text-amber-600 text-xs">
								<WarningIcon
									className="mt-0.5 shrink-0"
									size={14}
									weight="fill"
								/>
								<span className="leading-relaxed">
									Large date ranges may affect performance
								</span>
							</div>
						) : null}
					</>
				}
				descriptionClassName="text-sidebar-foreground/70"
				title="Traffic Trends"
				titleClassName="font-semibold text-base text-sidebar-foreground sm:text-lg"
			>
				<SectionBrandOverlay layout="inline" />
			</Chart.Header>
			<Chart.Content<ChartDataRow[]>
				emptyProps={{
					description:
						"Your analytics data will appear here as visitors interact with your website",
					icon: <ChartLineIcon className="size-12" weight="duotone" />,
					title: "No data available",
				}}
				errorProps={{
					description: "We couldn’t load traffic data. Try again in a moment.",
					icon: <WarningCircleIcon className="size-12" weight="duotone" />,
					title: "Something went wrong",
					variant: "error",
				}}
				loading={
					<div className="overflow-x-auto">
						<div
							aria-hidden
							className="relative w-full"
							style={{ height: plotRegionHeight }}
						>
							<Skeleton className="absolute inset-0 rounded-none bg-sidebar-foreground/10" />
						</div>
					</div>
				}
				outcome={outcome}
			>
				{(series) => (
					<div className="overflow-x-auto">
						<TrafficTrendsRechartsPlot
							className="rounded-none border-0"
							data={series}
							dateRange={{
								startDate: new Date(dateRange.start_date),
								endDate: new Date(dateRange.end_date),
								granularity: (dateRange.granularity ?? "daily") as
									| "hourly"
									| "daily"
									| "weekly"
									| "monthly",
							}}
							height={plotHeight}
							onRangeSelect={onRangeSelect}
							websiteId={websiteId}
						/>
					</div>
				)}
			</Chart.Content>
		</Chart>
	);
}
