"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { ANNOTATION_STORAGE_KEYS } from "@/lib/annotation-constants";
import { orpc } from "@/lib/orpc";
import type {
	Annotation,
	AnnotationFormData,
	ChartContext,
	CreateAnnotationData,
} from "@/types/annotations";
import { AnnotationModal } from "./annotation-modal";
import { MetricsChart } from "./metrics-chart";

type CreateAnnotationInput = {
	annotationType: "range";
	xValue: string;
	xEndValue: string;
	text: string;
	tags: string[];
	color: string;
	isPublic: boolean;
};

type MetricsChartWithAnnotationsProps = {
	websiteId: string;
	data: any[] | undefined;
	isLoading: boolean;
	height?: number;
	title?: string;
	description?: string;
	className?: string;
	metricsFilter?: (metric: any) => boolean;
	showLegend?: boolean;
	onRangeSelect?: (dateRange: { startDate: Date; endDate: Date }) => void;
	dateRange?: {
		startDate: Date;
		endDate: Date;
		granularity: "hourly" | "daily" | "weekly" | "monthly";
	};
};

export function MetricsChartWithAnnotations({
	websiteId,
	data,
	isLoading,
	height = 550,
	title,
	description,
	className,
	metricsFilter,
	showLegend = true,
	onRangeSelect,
	dateRange,
}: MetricsChartWithAnnotationsProps) {
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
				granularity: "daily",
			},
			metrics: ["pageviews", "visitors", "sessions"],
		};
	}, [dateRange, data]);

	const { data: allAnnotations, refetch: refetchAnnotations } = useQuery({
		...orpc.annotations.list.queryOptions({
			input: {
				websiteId,
				chartType: "metrics" as const,
				chartContext: chartContext as any,
			},
		}),
		enabled: !!websiteId && !!chartContext,
	});

	const annotations = useMemo(() => {
		if (!(allAnnotations && dateRange)) {
			return [];
		}

		const { startDate, endDate } = dateRange;

		return allAnnotations.filter((annotation) => {
			const annotationStart = new Date(annotation.xValue);
			const annotationEnd = annotation.xEndValue
				? new Date(annotation.xEndValue)
				: annotationStart;

			return (
				(annotationStart >= startDate && annotationStart <= endDate) ||
				(annotationEnd >= startDate && annotationEnd <= endDate) ||
				(annotationStart <= startDate && annotationEnd >= endDate)
			);
		});
	}, [allAnnotations, dateRange]);

	const closeEditModal = () => {
		setEditingAnnotation(null);
	};

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
			loading: "Creating annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation created successfully! 🎉";
			},
			error: (err) => {
				console.error("Failed to create annotation:", err);
				return err?.message || "Failed to create annotation";
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
			loading: "Deleting annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation deleted successfully";
			},
			error: (err) => {
				console.error("Failed to delete annotation:", err);
				return err?.message || "Failed to delete annotation";
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
			loading: "Updating annotation...",
			success: () => {
				refetchAnnotations();
				return "Annotation updated successfully";
			},
			error: (err) => {
				console.error("Failed to update annotation:", err);
				return err?.message || "Failed to update annotation";
			},
		});

		await promise;
	};

	return (
		<>
			<MetricsChart
				annotations={(annotations || []) as Annotation[]}
				className={className}
				data={data}
				description={description}
				granularity={dateRange?.granularity}
				height={height}
				isLoading={isLoading}
				metricsFilter={metricsFilter}
				onCreateAnnotation={handleCreateAnnotation}
				onDeleteAnnotation={handleDeleteAnnotation}
				onEditAnnotation={handleEditAnnotation}
				onRangeSelect={onRangeSelect}
				onToggleAnnotations={setShowAnnotations}
				showAnnotations={showAnnotations}
				showLegend={showLegend}
				title={title}
				websiteId={websiteId}
			/>

			{/* Edit Annotation Modal */}
			{editingAnnotation && (
				<AnnotationModal
					annotation={editingAnnotation}
					isOpen={true}
					isSubmitting={updateAnnotation.isPending}
					mode="edit"
					onClose={closeEditModal}
					onSubmit={handleSaveAnnotation}
				/>
			)}
		</>
	);
}
