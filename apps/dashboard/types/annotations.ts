/**
 * Annotation types and interfaces for the chart annotations system
 */

export type AnnotationType = "point" | "line" | "range";

export type ChartType = "metrics";

export interface Annotation {
	annotationType: AnnotationType;
	chartContext: ChartContext;
	chartType: ChartType;
	color: string;
	createdAt: Date | string;
	createdBy: string;
	deletedAt?: Date | string | null;
	id: string;
	isPublic: boolean;
	tags: string[] | null;
	text: string;
	updatedAt: Date | string;
	websiteId: string;
	xEndValue: Date | string | null;
	xValue: Date | string;
	yValue?: number | null;
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
	annotationType: AnnotationType;
	chartContext: ChartContext;
	chartType: ChartType;
	color?: string;
	isPublic?: boolean;
	tags?: string[];
	text: string;
	websiteId: string;
	xEndValue?: string;
	xValue: string;
	yValue?: number;
}

export interface UpdateAnnotationData {
	color?: string;
	id: string;
	isPublic?: boolean;
	tags?: string[];
	text?: string;
}

export interface AnnotationColor {
	label: string;
	value: string;
}

export interface AnnotationTag {
	color: string;
	label: string;
	value: string;
}

export interface ListAnnotationsInput {
	chartContext: ChartContext;
	chartType: ChartType;
	websiteId: string;
}

export interface AnnotationFormData {
	color: string;
	isPublic: boolean;
	tags: string[];
	text: string;
}
