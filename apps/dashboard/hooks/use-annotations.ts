"use client";

import { trpc } from "@/lib/trpc";

interface CreateAnnotationInput {
	websiteId: string;
	chartType: "metrics";
	chartContext: Record<string, any>;
	annotationType: "point" | "line" | "range";
	xValue: string;
	xEndValue?: string;
	yValue?: number;
	text: string;
	tags?: string[];
	color?: string;
	isPublic?: boolean;
}

interface UpdateAnnotationInput {
	id: string;
	text?: string;
	tags?: string[];
	color?: string;
	isPublic?: boolean;
}

interface ListAnnotationsInput {
	websiteId: string;
	chartType: "metrics";
	chartContext: {
		dateRange: {
			start_date: string;
			end_date: string;
			granularity: "hourly" | "daily" | "weekly" | "monthly";
		};
		filters?: Array<{
			field: string;
			operator: "eq" | "ne" | "gt" | "lt" | "contains";
			value: string;
		}>;
		metrics?: string[];
		tabId?: string;
	};
}

export function useAnnotations(input: ListAnnotationsInput) {
	const {
		data: annotations,
		isLoading,
		error,
	} = trpc.annotations.list.useQuery(input, { enabled: !!input.websiteId });

	const createAnnotation = trpc.annotations.create.useMutation();

	const updateAnnotation = trpc.annotations.update.useMutation();

	const deleteAnnotation = trpc.annotations.delete.useMutation();

	return {
		annotations: annotations || [],
		isLoading,
		error,
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
	};
}

export function useAnnotationById(id: string) {
	return trpc.annotations.getById.useQuery({ id }, { enabled: !!id });
}
