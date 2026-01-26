import type { ComponentType } from "react";

export interface RawComponentInput {
	type: string;
	[key: string]: unknown;
}

export interface BaseComponentProps {
	className?: string;
}

export interface ComponentDefinition<
	TInput extends Record<string, unknown>,
	TProps extends BaseComponentProps,
> {
	validate: (input: RawComponentInput) => input is RawComponentInput & TInput;
	transform: (input: TInput) => TProps;
	component: ComponentType<TProps>;
}

export type ComponentRegistry = Record<
	string,
	ComponentDefinition<Record<string, unknown>, BaseComponentProps>
>;

export interface ParsedContent {
	text: string;
	components: RawComponentInput[];
}

export type ContentSegment =
	| { type: "text"; content: string }
	| { type: "component"; content: RawComponentInput };

export interface ParsedSegments {
	segments: ContentSegment[];
}

// Chart types

export interface ChartComponentProps extends BaseComponentProps {
	title?: string;
}

export interface TimeSeriesInput {
	type: string;
	title?: string;
	data: {
		x: string[];
		[series: string]: string[] | number[];
	};
}

export interface DistributionInput {
	type: string;
	title?: string;
	data: {
		labels: string[];
		values: number[];
	};
}

// Links types

export interface LinksListInput {
	type: "links-list";
	title?: string;
	links: Array<{
		id: string;
		name: string;
		slug: string;
		targetUrl: string;
		expiresAt?: string | null;
		createdAt?: string;
		ogTitle?: string | null;
		ogDescription?: string | null;
		ogImageUrl?: string | null;
		ogVideoUrl?: string | null;
		iosUrl?: string | null;
		androidUrl?: string | null;
		expiredRedirectUrl?: string | null;
		organizationId?: string;
	}>;
	baseUrl?: string;
}

export interface LinkPreviewInput {
	type: "link-preview";
	mode: "create" | "update" | "delete";
	link: {
		name: string;
		targetUrl: string;
		slug?: string;
		expiresAt?: string | null;
		expiredRedirectUrl?: string | null;
		ogTitle?: string | null;
		ogDescription?: string | null;
		ogImageUrl?: string | null;
	};
	message?: string;
}

// Funnels types

export interface FunnelStepInput {
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
	target: string;
	name: string;
}

export interface FunnelsListInput {
	type: "funnels-list";
	title?: string;
	funnels: Array<{
		id: string;
		name: string;
		description?: string | null;
		steps: FunnelStepInput[];
		isActive: boolean;
		createdAt?: string;
	}>;
}

export interface FunnelPreviewInput {
	type: "funnel-preview";
	mode: "create" | "update" | "delete";
	funnel: {
		name: string;
		description?: string | null;
		steps: FunnelStepInput[];
		ignoreHistoricData?: boolean;
	};
}

// Goals types

export interface GoalsListInput {
	type: "goals-list";
	title?: string;
	goals: Array<{
		id: string;
		name: string;
		description?: string | null;
		type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
		target: string;
		isActive: boolean;
		createdAt?: string;
	}>;
}

export interface GoalPreviewInput {
	type: "goal-preview";
	mode: "create" | "update" | "delete";
	goal: {
		name: string;
		description?: string | null;
		type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
		target: string;
		ignoreHistoricData?: boolean;
	};
}

// Annotations types

export interface AnnotationsListInput {
	type: "annotations-list";
	title?: string;
	annotations: Array<{
		id: string;
		text: string;
		annotationType: "point" | "line" | "range";
		xValue: string;
		xEndValue?: string | null;
		color?: string | null;
		tags?: string[];
		isPublic?: boolean;
		createdAt?: string;
	}>;
}

export interface AnnotationPreviewInput {
	type: "annotation-preview";
	mode: "create" | "update" | "delete";
	annotation: {
		text: string;
		annotationType: "point" | "line" | "range";
		xValue: string;
		xEndValue?: string | null;
		color?: string | null;
		tags?: string[];
		isPublic?: boolean;
	};
}
