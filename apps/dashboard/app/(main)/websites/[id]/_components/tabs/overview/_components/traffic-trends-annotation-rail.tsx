"use client";

import { useMemo } from "react";
import type { ChartDataRow } from "@/components/charts/metrics-constants";
import {
	formatAnnotationDateRange,
	isSingleDayAnnotation,
} from "@/lib/annotation-utils";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/types/annotations";
import { NoteIcon } from "@databuddy/ui/icons";
import { Button, Tooltip as UiTooltip, dayjs } from "@databuddy/ui";

export type TrafficTrendsGranularity =
	| "hourly"
	| "daily"
	| "weekly"
	| "monthly";

const ANNOTATION_RAIL_CLUSTER_GAP = 1;
const ANNOTATION_RAIL_MIN_CLUSTER_GAP_PERCENT = 2.25;
const ANNOTATION_RAIL_BASE_HEIGHT = 28;
const ANNOTATION_RAIL_RANGE_MIN_PERCENT = 2.5;

interface AnnotationRenderItem {
	annotation: Annotation;
	endIndex: number;
	isSingleDayRange: boolean;
	startIndex: number;
}

interface AnnotationRailCluster {
	endIndex: number;
	id: string;
	items: AnnotationRenderItem[];
	startIndex: number;
}

function getChartPointDate(point: ChartDataRow): string {
	return (point as ChartDataRow & { rawDate?: string }).rawDate || point.date;
}

function getComparableDate(
	date: Date | string,
	isHourlyBucket: boolean,
	boundary: "end" | "start" = "start"
): Date {
	const parsed = dayjs(date);
	if (isHourlyBucket) {
		return parsed.toDate();
	}
	return boundary === "end"
		? parsed.endOf("day").toDate()
		: parsed.startOf("day").toDate();
}

export function buildAnnotationRenderItems({
	annotations,
	chartData,
	granularity,
}: {
	annotations: Annotation[];
	chartData: Array<ChartDataRow & { xKey: string }>;
	granularity: TrafficTrendsGranularity;
}): AnnotationRenderItem[] {
	const chartFirst = chartData[0];
	const chartLast = chartData.at(-1);
	if (!(chartFirst && chartLast)) {
		return [];
	}

	const isHourlyBucket = granularity === "hourly";
	const chartDomainStart = getComparableDate(
		getChartPointDate(chartFirst),
		isHourlyBucket
	);
	const chartDomainEnd = getComparableDate(
		getChartPointDate(chartLast),
		isHourlyBucket,
		"end"
	);

	const visibleItems: AnnotationRenderItem[] = [];

	for (const annotation of annotations) {
		const rangeStart = getComparableDate(annotation.xValue, isHourlyBucket);
		const rangeEnd = getComparableDate(
			annotation.xEndValue || annotation.xValue,
			isHourlyBucket,
			"end"
		);

		if (rangeEnd < chartDomainStart || rangeStart > chartDomainEnd) {
			continue;
		}

		let startIndex = 0;
		for (let i = 0; i < chartData.length; i++) {
			const point = chartData[i];
			if (!point) {
				continue;
			}
			const pointCompare = getComparableDate(
				getChartPointDate(point),
				isHourlyBucket
			);
			if (pointCompare >= rangeStart) {
				startIndex = i;
				break;
			}
		}

		let endIndex = chartData.length - 1;
		for (let i = chartData.length - 1; i >= 0; i--) {
			const point = chartData[i];
			if (!point) {
				continue;
			}
			const pointCompare = getComparableDate(
				getChartPointDate(point),
				isHourlyBucket
			);
			if (pointCompare <= rangeEnd) {
				endIndex = i;
				break;
			}
		}

		visibleItems.push({
			annotation,
			endIndex,
			isSingleDayRange: isSingleDayAnnotation(annotation),
			startIndex,
		});
	}

	return visibleItems.sort(
		(a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex
	);
}

function getTimelinePercent(index: number, pointCount: number): number {
	if (pointCount <= 1) {
		return 50;
	}

	return Math.min(100, Math.max(0, (index / (pointCount - 1)) * 100));
}

function getMarkerPercent(index: number, pointCount: number): number {
	return Math.min(98, Math.max(2, getTimelinePercent(index, pointCount)));
}

function getClusterEndPercent(
	cluster: AnnotationRailCluster,
	pointCount: number
): number {
	return getTimelinePercent(cluster.endIndex, pointCount);
}

function shouldClusterItem({
	cluster,
	itemEnd,
	itemStart,
	pointCount,
}: {
	cluster: AnnotationRailCluster;
	itemEnd: number;
	itemStart: number;
	pointCount: number;
}): boolean {
	const isIndexOverlap =
		itemStart <= cluster.endIndex + ANNOTATION_RAIL_CLUSTER_GAP &&
		itemEnd >= cluster.startIndex - ANNOTATION_RAIL_CLUSTER_GAP;
	const itemStartPercent = getTimelinePercent(itemStart, pointCount);
	const isVisuallyClose =
		itemStartPercent <=
		getClusterEndPercent(cluster, pointCount) +
			ANNOTATION_RAIL_MIN_CLUSTER_GAP_PERCENT;

	return isIndexOverlap || isVisuallyClose;
}

function buildAnnotationRailClusters({
	items,
	pointCount,
}: {
	items: AnnotationRenderItem[];
	pointCount: number;
}): AnnotationRailCluster[] {
	const clusters: AnnotationRailCluster[] = [];

	for (const item of items) {
		const itemStart = item.startIndex;
		const itemEnd = Math.max(item.endIndex, item.startIndex);

		let matchingCluster: AnnotationRailCluster | undefined;
		for (const candidate of clusters) {
			if (
				shouldClusterItem({
					cluster: candidate,
					itemEnd,
					itemStart,
					pointCount,
				})
			) {
				matchingCluster = candidate;
				break;
			}
		}

		if (matchingCluster) {
			matchingCluster.items.push(item);
			matchingCluster.startIndex = Math.min(
				matchingCluster.startIndex,
				itemStart
			);
			matchingCluster.endIndex = Math.max(matchingCluster.endIndex, itemEnd);
			matchingCluster.id = matchingCluster.items
				.map(({ annotation }) => annotation.id)
				.join(":");
			continue;
		}

		clusters.push({
			endIndex: itemEnd,
			id: item.annotation.id,
			items: [item],
			startIndex: itemStart,
		});
	}

	return clusters.sort(
		(a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex
	);
}

interface AnnotationRailTooltipContentProps {
	cluster: AnnotationRailCluster;
	granularity: TrafficTrendsGranularity;
}

function AnnotationRailTooltipContent({
	cluster,
	granularity,
}: AnnotationRailTooltipContentProps) {
	const previewItems = cluster.items.slice(0, 3);
	const hiddenCount = cluster.items.length - previewItems.length;

	return (
		<div className="w-56 space-y-2 text-left">
			<p className="font-medium text-xs">
				{cluster.items.length === 1
					? "Annotation"
					: `${cluster.items.length} annotations`}
			</p>
			<div className="space-y-1.5">
				{previewItems.map((item) => (
					<div className="flex min-w-0 gap-2" key={item.annotation.id}>
						<span
							className="mt-1 size-1.5 shrink-0 rounded-full"
							style={{ backgroundColor: item.annotation.color }}
						/>
						<div className="min-w-0">
							<p className="line-clamp-2 text-xs leading-snug">
								{item.annotation.text}
							</p>
							<p className="truncate text-[10px] text-background/70">
								{formatAnnotationDateRange(
									item.annotation.xValue,
									item.annotation.xEndValue,
									granularity
								)}
							</p>
						</div>
					</div>
				))}
			</div>
			{hiddenCount > 0 ? (
				<p className="text-[10px] text-background/70">+{hiddenCount} more</p>
			) : null}
		</div>
	);
}

interface AnnotationRailMarkerProps {
	cluster: AnnotationRailCluster;
	granularity: TrafficTrendsGranularity;
	onEditAnnotation: (annotation: Annotation) => void;
	onOpenAnnotationsPanel: () => void;
	pointCount: number;
}

function AnnotationRailMarker({
	cluster,
	granularity,
	onEditAnnotation,
	onOpenAnnotationsPanel,
	pointCount,
}: AnnotationRailMarkerProps) {
	const firstItem = cluster.items[0];
	if (!firstItem) {
		return null;
	}

	const centerPercent = getMarkerPercent(
		(cluster.startIndex + cluster.endIndex) / 2,
		pointCount
	);
	const startPercent = getTimelinePercent(cluster.startIndex, pointCount);
	const endPercent = getTimelinePercent(cluster.endIndex, pointCount);
	const widthPercent = Math.max(
		endPercent - startPercent,
		ANNOTATION_RAIL_RANGE_MIN_PERCENT
	);
	const markerTop = 4;
	const rangeTop = markerTop + 9;
	const hasRange = cluster.items.some(
		(item) => item.annotation.xEndValue && !item.isSingleDayRange
	);
	const isCluster = cluster.items.length > 1;
	const buttonLabel = isCluster
		? `${cluster.items.length} annotations`
		: `Annotation: ${firstItem.annotation.text}`;

	const handleOpen = () => {
		if (isCluster) {
			onOpenAnnotationsPanel();
			return;
		}

		onEditAnnotation(firstItem.annotation);
	};

	return (
		<>
			{hasRange ? (
				<div
					aria-hidden
					className="absolute h-1 rounded-full opacity-35"
					style={{
						backgroundColor: firstItem.annotation.color,
						left: `${startPercent}%`,
						top: rangeTop,
						width: `max(18px, ${widthPercent}%)`,
					}}
				/>
			) : null}
			<UiTooltip
				content={
					<AnnotationRailTooltipContent
						cluster={cluster}
						granularity={granularity}
					/>
				}
				delay={150}
				side="top"
			>
				<Button
					aria-label={buttonLabel}
					className={cn(
						"absolute z-10 h-5 min-w-5 -translate-x-1/2 rounded-full border bg-card px-1.5 text-[10px] text-foreground shadow-sm",
						"hover:bg-accent hover:text-accent-foreground",
						isCluster ? "gap-1" : "px-1"
					)}
					onClick={(event) => {
						event.stopPropagation();
						handleOpen();
					}}
					onMouseDown={(event) => event.stopPropagation()}
					onMouseUp={(event) => event.stopPropagation()}
					size="sm"
					style={{
						borderColor: firstItem.annotation.color,
						left: `${centerPercent}%`,
						top: markerTop,
					}}
					type="button"
					variant="secondary"
				>
					<span
						className={cn(
							"shrink-0 rounded-full",
							isCluster ? "size-1.5" : "size-2"
						)}
						style={{ backgroundColor: firstItem.annotation.color }}
					/>
					{isCluster ? <span>{cluster.items.length}</span> : null}
				</Button>
			</UiTooltip>
		</>
	);
}

interface TrafficTrendsAnnotationRailProps {
	granularity: TrafficTrendsGranularity;
	items: AnnotationRenderItem[];
	onEditAnnotation: (annotation: Annotation) => void;
	onOpenAnnotationsPanel: () => void;
	plotLeftOffset: number;
	plotRightOffset: number;
	pointCount: number;
}

export function TrafficTrendsAnnotationRail({
	items,
	granularity,
	onEditAnnotation,
	onOpenAnnotationsPanel,
	plotLeftOffset,
	plotRightOffset,
	pointCount,
}: TrafficTrendsAnnotationRailProps) {
	const clusters = useMemo(
		() => buildAnnotationRailClusters({ items, pointCount }),
		[items, pointCount]
	);

	if (!clusters.length) {
		return null;
	}

	return (
		<div className="border-sidebar-border/60 border-t bg-sidebar/40 py-2">
			<div
				className="grid"
				style={{
					gridTemplateColumns: `${plotLeftOffset}px minmax(0, 1fr) ${plotRightOffset}px`,
				}}
			>
				<div className="flex items-start justify-end pt-1 pr-2">
					<UiTooltip
						content={`${items.length} annotation${items.length === 1 ? "" : "s"}`}
						delay={150}
						side="top"
					>
						<span className="inline-flex size-5 items-center justify-center rounded border bg-card text-muted-foreground">
							<NoteIcon className="size-3" weight="duotone" />
						</span>
					</UiTooltip>
				</div>
				<div
					className="relative"
					style={{ height: ANNOTATION_RAIL_BASE_HEIGHT }}
				>
					<div className="absolute inset-x-0 top-3.5 h-px bg-border/70" />
					{clusters.map((cluster) => (
						<AnnotationRailMarker
							cluster={cluster}
							granularity={granularity}
							key={cluster.id}
							onEditAnnotation={onEditAnnotation}
							onOpenAnnotationsPanel={onOpenAnnotationsPanel}
							pointCount={pointCount}
						/>
					))}
				</div>
				<div />
			</div>
		</div>
	);
}
