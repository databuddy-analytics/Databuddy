"use client";

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
import {
	buildAnnotationRenderItems,
	TrafficTrendsAnnotationRail,
	type TrafficTrendsGranularity,
} from "./traffic-trends-annotation-rail";

import {
	Chart,
	type ChartInteractiveFeatures,
	mergeChartInteractiveFeatures,
} from "@/components/ui/composables/chart";
import { useChartPreferences } from "@/hooks/use-chart-preferences";
import { ANNOTATION_STORAGE_KEYS } from "@/lib/annotation-constants";
import {
	chartAxisTickDefault,
	chartCartesianGridDefault,
	chartRechartsInteractiveLegendLabelClassName,
	chartRechartsLegendIconSize,
} from "@/lib/chart-presentation";
import { chartQueryOutcome } from "@/lib/chart-query-outcome";
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
import {
	ChartLineIcon,
	EyeIcon,
	EyeSlashIcon,
	NoteIcon,
	WarningCircleIcon,
	WarningIcon,
	XMarkIcon as XIcon,
} from "@databuddy/ui/icons";
import { Button, Skeleton, dayjs, usePersistentState } from "@databuddy/ui";

const {
	Area,
	CartesianGrid,
	ComposedChart,
	Customized,
	Legend,
	ReferenceArea,
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
	annotations: Annotation[];
	className?: string;
	data: ChartDataRow[];
	dateRange: {
		endDate: Date;
		granularity: TrafficTrendsGranularity;
		startDate: Date;
	};
	features?: ChartInteractiveFeatures;
	height: number;
	onCreateAnnotation: (annotation: CreateAnnotationInput) => Promise<void>;
	onEditAnnotation: (annotation: Annotation) => void;
	onOpenAnnotationsPanel: () => void;
	onRangeSelect?: (dateRange: DateRangeState) => void;
	showAnnotations: boolean;
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

const LEGEND_WRAPPER_STYLE = {
	cursor: "pointer",
	display: "flex",
	fontSize: "11px",
	gap: 10,
	justifyContent: "center",
	lineHeight: 1.2,
	paddingTop: "8px",
	paddingBottom: "4px",
} as const;

const CHART_MARGIN = {
	top: 20,
	right: 20,
	left: 10,
	bottom: 10,
} as const;
const CHART_Y_AXIS_WIDTH = 45;
const CHART_PLOT_LEFT_OFFSET = CHART_MARGIN.left + CHART_Y_AXIS_WIDTH;

function TrafficTrendsRechartsPlot({
	annotations,
	className,
	data,
	dateRange,
	features: featuresProp,
	height,
	onCreateAnnotation,
	onEditAnnotation,
	onOpenAnnotationsPanel,
	onRangeSelect,
	showAnnotations,
	websiteId,
}: TrafficTrendsRechartsPlotProps) {
	const mergedFeatures = mergeChartInteractiveFeatures(featuresProp);
	const granularity = dateRange.granularity;

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

	const handleInternalCreateAnnotation = async (
		annotation: CreateAnnotationInput
	) => {
		await onCreateAnnotation(annotation);
		setShowAnnotationModal(false);
	};

	const annotationRenderItems = useMemo(
		() =>
			buildAnnotationRenderItems({
				annotations,
				chartData,
				granularity,
			}),
		[annotations, chartData, granularity]
	);
	const shouldSuppressChartTooltip = suppressTooltip;

	if (!chartData.length) {
		return null;
	}

	return (
		<div className={cn("w-full", className)}>
			<div
				className="relative select-none"
				style={{
					width: "100%",
					height,
					userSelect: refAreaLeft ? "none" : "auto",
					WebkitUserSelect: refAreaLeft ? "none" : "auto",
				}}
			>
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
							<Button
								className="h-6 gap-1.5 border bg-card/90 px-2 text-muted-foreground text-xs shadow-sm backdrop-blur-sm hover:text-foreground"
								onClick={() => setTipDismissed(true)}
								size="sm"
								type="button"
								variant="secondary"
							>
								<NoteIcon className="size-3" weight="duotone" />
								<span>Drag to annotate</span>
								<XIcon className="size-2.5" />
							</Button>
						</div>
					)}
				<ResponsiveContainer height="100%" width="100%">
					<ComposedChart
						data={chartData}
						margin={CHART_MARGIN}
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
							width={CHART_Y_AXIS_WIDTH}
						/>
						<Tooltip
							content={
								<CustomTooltip
									isDragging={isDragging}
									justFinishedDragging={suppressTooltip}
								/>
							}
							cursor={
								shouldSuppressChartTooltip
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

						<Legend
							align="center"
							formatter={(label) => {
								const metric = metrics.find((m) => m.label === label);
								const isHidden = metric ? hiddenMetrics[metric.key] : false;
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
								const metric = metrics.find((m) => m.label === payload.value);
								if (metric) {
									toggleMetric(metric.key as keyof typeof visibleMetrics);
								}
							}}
							verticalAlign="bottom"
							wrapperStyle={LEGEND_WRAPPER_STYLE}
						/>
						{metrics.map((metric) => (
							<Area
								activeDot={
									shouldSuppressChartTooltip
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

			{mergedFeatures.annotations &&
			showAnnotations === true &&
			annotationRenderItems.length > 0 ? (
				<TrafficTrendsAnnotationRail
					granularity={granularity}
					items={annotationRenderItems}
					onEditAnnotation={onEditAnnotation}
					onOpenAnnotationsPanel={onOpenAnnotationsPanel}
					plotLeftOffset={CHART_PLOT_LEFT_OFFSET}
					plotRightOffset={CHART_MARGIN.right}
					pointCount={chartData.length}
				/>
			) : null}

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
	const plotRegionHeight = plotHeight;

	const [editingAnnotation, setEditingAnnotation] = useState<Annotation | null>(
		null
	);
	const [isAnnotationsPanelOpen, setIsAnnotationsPanelOpen] = useState(false);

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
		if (!(dateRange && chartData?.length)) {
			return null;
		}

		return {
			dateRange: {
				start_date: dateRange.start_date,
				end_date: dateRange.end_date,
				granularity: dateRange.granularity ?? "daily",
			},
			metrics: ["pageviews", "sessions", "visitors"],
		};
	}, [dateRange, chartData]);

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

	const annotations = useMemo(() => {
		if (!(allAnnotations && dateRange)) {
			return [];
		}

		const startDate = new Date(dateRange.start_date);
		const endDate = dayjs(dateRange.end_date).endOf("day").toDate();

		return allAnnotations
			.filter((annotation) => {
				const annotationStart = new Date(annotation.xValue);
				const annotationEnd = annotation.xEndValue
					? new Date(annotation.xEndValue)
					: annotationStart;

				return annotationStart <= endDate && annotationEnd >= startDate;
			})
			.sort(
				(a, b) =>
					new Date(a.xValue).getTime() - new Date(b.xValue).getTime() ||
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
			);
	}, [allAnnotations, dateRange]) as Annotation[];

	const handleCreateAnnotation = async (annotation: CreateAnnotationInput) => {
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

	const granularity = (dateRange.granularity ??
		"daily") as TrafficTrendsGranularity;
	const plotDateRange = useMemo(
		() => ({
			startDate: new Date(dateRange.start_date),
			endDate: new Date(dateRange.end_date),
			granularity,
		}),
		[dateRange.start_date, dateRange.end_date, granularity]
	);

	return (
		<div className="rounded-xl bg-secondary p-1.5">
			<Chart className="gap-0 overflow-hidden rounded-lg border-sidebar-border py-0">
				<Chart.Header
					className="border-sidebar-border/60 bg-sidebar px-3 py-2.5 sm:items-center sm:px-4 sm:py-3"
					description={
						<>
							<p className="text-xs sm:text-sm">
								{granularity === "hourly" ? "Hourly" : "Daily"} traffic data
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
					{annotations.length > 0 && (
						<div className="flex items-center gap-0.5">
							<Button
								aria-label={
									showAnnotations ? "Hide annotations" : "Show annotations"
								}
								className="size-7 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
								onEdit={setEditingAnnotation}
								onOpenChange={setIsAnnotationsPanelOpen}
								open={isAnnotationsPanelOpen}
							/>
						</div>
					)}
				</Chart.Header>
				<Chart.Content<ChartDataRow[]>
					emptyProps={{
						description:
							"Your analytics data will appear here as visitors interact with your website",
						icon: <ChartLineIcon className="size-12" weight="duotone" />,
						title: "No data available",
					}}
					errorProps={{
						description:
							"We couldn't load traffic data. Try again in a moment.",
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
								<Skeleton className="absolute inset-0 rounded-none" />
							</div>
						</div>
					}
					outcome={outcome}
				>
					{(series) => (
						<div className="overflow-x-auto">
							<TrafficTrendsRechartsPlot
								annotations={annotations}
								className="rounded-none border-0"
								data={series}
								dateRange={plotDateRange}
								height={plotHeight}
								onCreateAnnotation={handleCreateAnnotation}
								onEditAnnotation={setEditingAnnotation}
								onOpenAnnotationsPanel={() => setIsAnnotationsPanelOpen(true)}
								onRangeSelect={onRangeSelect}
								showAnnotations={showAnnotations}
								websiteId={websiteId}
							/>
						</div>
					)}
				</Chart.Content>
			</Chart>

			{editingAnnotation ? (
				<AnnotationModal
					annotation={editingAnnotation}
					isOpen={true}
					isSubmitting={updateAnnotation.isPending}
					mode="edit"
					onClose={() => setEditingAnnotation(null)}
					onSubmit={handleSaveAnnotation}
				/>
			) : null}
		</div>
	);
}
