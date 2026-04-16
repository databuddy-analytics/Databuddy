import type { ComponentType } from "react";

export interface RawComponentInput {
	type: string;
	[key: string]: unknown;
}

export interface BaseComponentProps {
	className?: string;
	streaming?: boolean;
}

export interface ComponentDefinition<
	TInput = Record<string, unknown>,
	TProps extends BaseComponentProps = BaseComponentProps,
> {
	component: ComponentType<TProps>;
	transform: (input: TInput) => TProps;
	validate: (input: RawComponentInput) => input is RawComponentInput & TInput;
}

export type ComponentRegistry = Record<string, ComponentDefinition<any, any>>;

export interface ParsedContent {
	components: RawComponentInput[];
	text: string;
}

export type ContentSegment =
	| { type: "text"; content: string }
	| { type: "component"; content: RawComponentInput }
	| { type: "streaming-component"; content: RawComponentInput };

export interface ParsedSegments {
	segments: ContentSegment[];
}

export interface ChartComponentProps extends BaseComponentProps {
	title?: string;
}

export interface TimeSeriesInput {
	rows: unknown[][];
	series: string[];
	title?: string;
	type: string;
}

export interface DistributionInput {
	rows: unknown[][];
	title?: string;
	type: string;
}

export interface LinksListInput {
	baseUrl?: string;
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
	title?: string;
	type: "links-list";
}

export interface LinkPreviewInput {
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
	mode: "create" | "update" | "delete";
	type: "link-preview";
}

export interface FunnelStepInput {
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface FunnelsListInput {
	funnels: Array<{
		id: string;
		name: string;
		description?: string | null;
		steps: FunnelStepInput[];
		isActive: boolean;
		createdAt?: string;
	}>;
	title?: string;
	type: "funnels-list";
}

export interface FunnelPreviewInput {
	funnel: {
		name: string;
		description?: string | null;
		steps: FunnelStepInput[];
		ignoreHistoricData?: boolean;
	};
	mode: "create" | "update" | "delete";
	type: "funnel-preview";
}

export interface GoalsListInput {
	goals: Array<{
		id: string;
		name: string;
		description?: string | null;
		type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
		target: string;
		isActive: boolean;
		createdAt?: string;
	}>;
	title?: string;
	type: "goals-list";
}

export interface GoalPreviewInput {
	goal: {
		name: string;
		description?: string | null;
		type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
		target: string;
		ignoreHistoricData?: boolean;
	};
	mode: "create" | "update" | "delete";
	type: "goal-preview";
}

export interface AnnotationsListInput {
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
	title?: string;
	type: "annotations-list";
}

export interface AnnotationPreviewInput {
	annotation: {
		text: string;
		annotationType: "point" | "line" | "range";
		xValue: string;
		xEndValue?: string | null;
		color?: string | null;
		tags?: string[];
		isPublic?: boolean;
	};
	mode: "create" | "update" | "delete";
	type: "annotation-preview";
}

export interface DataTableInput {
	align?: ("left" | "center" | "right")[];
	columns: string[];
	description?: string;
	footer?: string;
	rows: unknown[][];
	title?: string;
	type: "data-table";
}

export interface ReferrerItem {
	domain?: string;
	name: string;
	pageviews?: number;
	percentage?: number;
	referrer?: string;
	visitors: number;
}

export interface ReferrersListInput {
	referrers: ReferrerItem[];
	title?: string;
	type: "referrers-list";
}

export interface CountryItem {
	country_code?: string;
	name: string;
	pageviews?: number;
	percentage?: number;
	visitors: number;
}

export interface MiniMapInput {
	countries: CountryItem[];
	title?: string;
	type: "mini-map";
}
