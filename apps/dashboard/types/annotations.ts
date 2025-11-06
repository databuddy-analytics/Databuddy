/**
 * Annotation types and interfaces for the chart annotations system
 */

export type AnnotationType = "point" | "line" | "range";

export type ChartType = "metrics";

export interface Annotation {
	id: string;
	websiteId: string;
	chartType: ChartType;
	chartContext: ChartContext;
	annotationType: AnnotationType;
	xValue: Date | string;
	xEndValue: Date | string | null;
	yValue?: number | null;
	text: string;
	tags: string[] | null;
	color: string;
	isPublic: boolean;
	createdBy: string;
	createdAt: Date | string;
	updatedAt: Date | string;
	deletedAt?: Date | string | null;
}

export interface ChartContext {
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
}

export interface CreateAnnotationData {
	websiteId: string;
	chartType: ChartType;
	chartContext: ChartContext;
	annotationType: AnnotationType;
	xValue: string;
	xEndValue?: string;
	yValue?: number;
	text: string;
	tags?: string[];
	color?: string;
	isPublic?: boolean;
}

export interface UpdateAnnotationData {
	id: string;
	text?: string;
	tags?: string[];
	color?: string;
	isPublic?: boolean;
}

export interface AnnotationColor {
	value: string;
	label: string;
}

export interface AnnotationTag {
	label: string;
	value: string;
	color: string;
}

export interface ListAnnotationsInput {
	websiteId: string;
	chartType: ChartType;
	chartContext: ChartContext;
}

export interface AnnotationFormData {
	text: string;
	tags: string[];
	color: string;
	isPublic: boolean;
}
