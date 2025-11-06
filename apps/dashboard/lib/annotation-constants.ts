import type { AnnotationColor, AnnotationTag } from "@/types/annotations";

/**
 * Available colors for annotations
 */
export const ANNOTATION_COLORS: AnnotationColor[] = [
	{ value: "#3B82F6", label: "Blue" },
	{ value: "#EF4444", label: "Red" },
	{ value: "#10B981", label: "Green" },
	{ value: "#F59E0B", label: "Yellow" },
	{ value: "#8B5CF6", label: "Purple" },
	{ value: "#EC4899", label: "Pink" },
];

/**
 * Common tags for quick selection
 */
export const COMMON_ANNOTATION_TAGS: AnnotationTag[] = [
	{ label: "Campaign", value: "campaign", color: "#3B82F6" },
	{ label: "Launch", value: "launch", color: "#10B981" },
	{ label: "Incident", value: "incident", color: "#EF4444" },
	{ label: "Feature", value: "feature", color: "#8B5CF6" },
	{ label: "Bug Fix", value: "bug", color: "#F59E0B" },
	{ label: "Holiday", value: "holiday", color: "#EC4899" },
	{ label: "Marketing", value: "marketing", color: "#06B6D4" },
	{ label: "Update", value: "update", color: "#84CC16" },
];

/**
 * Default annotation values
 */
export const DEFAULT_ANNOTATION_VALUES = {
	color: "#3B82F6",
	isPublic: false,
	maxTextLength: 500,
	tags: [] as string[],
} as const;

/**
 * Chart annotation styling constants
 */
export const CHART_ANNOTATION_STYLES = {
	strokeWidth: 3,
	strokeDasharray: "5 5",
	fillOpacity: 0.08,
	strokeOpacity: 0.6,
	fontSize: 11,
	fontWeight: 600,
	offset: 10,
} as const;

/**
 * Local storage keys for annotation preferences
 */
export const ANNOTATION_STORAGE_KEYS = {
	visibility: (websiteId: string) => `chart-annotations-visible-${websiteId}`,
	tipDismissed: (websiteId: string) =>
		`chart-annotations-tip-dismissed-${websiteId}`,
} as const;
