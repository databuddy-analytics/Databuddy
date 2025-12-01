"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";

type ListAnnotationsInput = {
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
};

export function useAnnotations(input: ListAnnotationsInput) {
	const {
		data: annotations,
		isLoading,
		error,
	} = useQuery({
		...orpc.annotations.list.queryOptions({ input }),
		enabled: !!input.websiteId,
	});

	const createAnnotation = useMutation({
		...orpc.annotations.create.mutationOptions(),
	});

	const updateAnnotation = useMutation({
		...orpc.annotations.update.mutationOptions(),
	});

	const deleteAnnotation = useMutation({
		...orpc.annotations.delete.mutationOptions(),
	});

	return {
		annotations: annotations ?? [],
		isLoading,
		error,
		createAnnotation,
		updateAnnotation,
		deleteAnnotation,
	};
}

export function useAnnotationById(id: string) {
	return useQuery({
		...orpc.annotations.getById.queryOptions({ input: { id } }),
		enabled: !!id,
	});
}
