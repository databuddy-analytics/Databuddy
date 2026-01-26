import {
	type AnnotationsListProps,
	AnnotationsListRenderer,
} from "./renderers/annotations/list";
import {
	type AnnotationPreviewProps,
	AnnotationPreviewRenderer,
} from "./renderers/annotations/preview";
import {
	type DistributionProps,
	DistributionRenderer,
} from "./renderers/charts/distribution";
import {
	type TimeSeriesProps,
	TimeSeriesRenderer,
} from "./renderers/charts/time-series";
import {
	type FunnelsListProps,
	FunnelsListRenderer,
} from "./renderers/funnels/list";
import {
	type FunnelPreviewProps,
	FunnelPreviewRenderer,
} from "./renderers/funnels/preview";
import { type GoalsListProps, GoalsListRenderer } from "./renderers/goals/list";
import {
	type GoalPreviewProps,
	GoalPreviewRenderer,
} from "./renderers/goals/preview";
import { type LinksListProps, LinksListRenderer } from "./renderers/links/list";
import {
	type LinkPreviewProps,
	LinkPreviewRenderer,
} from "./renderers/links/preview";
import type {
	AnnotationPreviewInput,
	AnnotationsListInput,
	ComponentDefinition,
	ComponentRegistry,
	DistributionInput,
	FunnelPreviewInput,
	FunnelsListInput,
	GoalPreviewInput,
	GoalsListInput,
	LinkPreviewInput,
	LinksListInput,
	RawComponentInput,
	TimeSeriesInput,
} from "./types";

// ============================================
// Chart Validators
// ============================================

function isTimeSeriesInput(
	input: RawComponentInput
): input is RawComponentInput & TimeSeriesInput {
	const data = input.data as Record<string, unknown> | undefined;
	if (!data || typeof data !== "object") {
		return false;
	}
	if (!Array.isArray(data.x) || data.x.length === 0) {
		return false;
	}
	if (!data.x.every((item) => typeof item === "string")) {
		return false;
	}
	const seriesKeys = Object.keys(data).filter((k) => k !== "x");
	return seriesKeys.some((key) => {
		const values = data[key];
		return Array.isArray(values) && values.every((v) => typeof v === "number");
	});
}

function isDistributionInput(
	input: RawComponentInput
): input is RawComponentInput & DistributionInput {
	const data = input.data as Record<string, unknown> | undefined;
	if (!data || typeof data !== "object") {
		return false;
	}
	if (!(Array.isArray(data.labels) && Array.isArray(data.values))) {
		return false;
	}
	if (data.labels.length === 0 || data.values.length === 0) {
		return false;
	}
	return (
		data.labels.every((item) => typeof item === "string") &&
		data.values.every((item) => typeof item === "number")
	);
}

// ============================================
// Links Validators
// ============================================

function isLinksListInput(
	input: RawComponentInput
): input is RawComponentInput & LinksListInput {
	if (input.type !== "links-list") {
		return false;
	}
	if (!Array.isArray(input.links)) {
		return false;
	}
	return input.links.every(
		(link) =>
			typeof link === "object" &&
			link !== null &&
			typeof (link as Record<string, unknown>).id === "string" &&
			typeof (link as Record<string, unknown>).name === "string" &&
			typeof (link as Record<string, unknown>).slug === "string" &&
			typeof (link as Record<string, unknown>).targetUrl === "string"
	);
}

function isLinkPreviewInput(
	input: RawComponentInput
): input is RawComponentInput & LinkPreviewInput {
	if (input.type !== "link-preview") {
		return false;
	}
	const mode = input.mode as string;
	if (!["create", "update", "delete"].includes(mode)) {
		return false;
	}
	const link = input.link as Record<string, unknown> | undefined;
	if (!link || typeof link !== "object") {
		return false;
	}
	return typeof link.name === "string" && typeof link.targetUrl === "string";
}

// ============================================
// Funnels Validators
// ============================================

function isFunnelsListInput(
	input: RawComponentInput
): input is RawComponentInput & FunnelsListInput {
	if (input.type !== "funnels-list") {
		return false;
	}
	if (!Array.isArray(input.funnels)) {
		return false;
	}
	return input.funnels.every(
		(funnel) =>
			typeof funnel === "object" &&
			funnel !== null &&
			typeof (funnel as Record<string, unknown>).id === "string" &&
			typeof (funnel as Record<string, unknown>).name === "string" &&
			Array.isArray((funnel as Record<string, unknown>).steps)
	);
}

function isFunnelPreviewInput(
	input: RawComponentInput
): input is RawComponentInput & FunnelPreviewInput {
	if (input.type !== "funnel-preview") {
		return false;
	}
	const mode = input.mode as string;
	if (!["create", "update", "delete"].includes(mode)) {
		return false;
	}
	const funnel = input.funnel as Record<string, unknown> | undefined;
	if (!funnel || typeof funnel !== "object") {
		return false;
	}
	return typeof funnel.name === "string" && Array.isArray(funnel.steps);
}

// ============================================
// Goals Validators
// ============================================

function isGoalsListInput(
	input: RawComponentInput
): input is RawComponentInput & GoalsListInput {
	if (input.type !== "goals-list") {
		return false;
	}
	if (!Array.isArray(input.goals)) {
		return false;
	}
	return input.goals.every(
		(goal) =>
			typeof goal === "object" &&
			goal !== null &&
			typeof (goal as Record<string, unknown>).id === "string" &&
			typeof (goal as Record<string, unknown>).name === "string" &&
			typeof (goal as Record<string, unknown>).target === "string"
	);
}

function isGoalPreviewInput(
	input: RawComponentInput
): input is RawComponentInput & GoalPreviewInput {
	if (input.type !== "goal-preview") {
		return false;
	}
	const mode = input.mode as string;
	if (!["create", "update", "delete"].includes(mode)) {
		return false;
	}
	const goal = input.goal as Record<string, unknown> | undefined;
	if (!goal || typeof goal !== "object") {
		return false;
	}
	return typeof goal.name === "string" && typeof goal.target === "string";
}

// ============================================
// Annotations Validators
// ============================================

function isAnnotationsListInput(
	input: RawComponentInput
): input is RawComponentInput & AnnotationsListInput {
	if (input.type !== "annotations-list") {
		return false;
	}
	if (!Array.isArray(input.annotations)) {
		return false;
	}
	return input.annotations.every(
		(annotation) =>
			typeof annotation === "object" &&
			annotation !== null &&
			typeof (annotation as Record<string, unknown>).id === "string" &&
			typeof (annotation as Record<string, unknown>).text === "string" &&
			typeof (annotation as Record<string, unknown>).xValue === "string"
	);
}

function isAnnotationPreviewInput(
	input: RawComponentInput
): input is RawComponentInput & AnnotationPreviewInput {
	if (input.type !== "annotation-preview") {
		return false;
	}
	const mode = input.mode as string;
	if (!["create", "update", "delete"].includes(mode)) {
		return false;
	}
	const annotation = input.annotation as Record<string, unknown> | undefined;
	if (!annotation || typeof annotation !== "object") {
		return false;
	}
	return (
		typeof annotation.text === "string" && typeof annotation.xValue === "string"
	);
}

// ============================================
// Chart Transformers
// ============================================

function toTimeSeriesProps(variant: "line" | "bar" | "area") {
	return (input: TimeSeriesInput): TimeSeriesProps => {
		const series = Object.keys(input.data).filter(
			(key) => key !== "x" && Array.isArray(input.data[key])
		);

		const chartData = input.data.x.map((xValue, idx) => {
			const point: Record<string, string | number> = { x: xValue };
			for (const key of series) {
				const values = input.data[key];
				if (Array.isArray(values)) {
					point[key] = (values[idx] as number) ?? 0;
				}
			}
			return point;
		});

		return { variant, title: input.title, data: chartData, series };
	};
}

function toDistributionProps(variant: "pie" | "donut") {
	return (input: DistributionInput): DistributionProps => ({
		variant,
		title: input.title,
		data: input.data.labels.map((label, idx) => ({
			name: label,
			value: input.data.values[idx] ?? 0,
		})),
	});
}

// ============================================
// Links Transformers
// ============================================

function toLinksListProps(input: LinksListInput): LinksListProps {
	return {
		title: input.title,
		links: input.links,
	};
}

function toLinkPreviewProps(input: LinkPreviewInput): LinkPreviewProps {
	return {
		mode: input.mode,
		link: input.link,
	};
}

// ============================================
// Funnels Transformers
// ============================================

function toFunnelsListProps(input: FunnelsListInput): FunnelsListProps {
	return {
		title: input.title,
		funnels: input.funnels,
	};
}

function toFunnelPreviewProps(input: FunnelPreviewInput): FunnelPreviewProps {
	return {
		mode: input.mode,
		funnel: input.funnel,
	};
}

// ============================================
// Goals Transformers
// ============================================

function toGoalsListProps(input: GoalsListInput): GoalsListProps {
	return {
		title: input.title,
		goals: input.goals,
	};
}

function toGoalPreviewProps(input: GoalPreviewInput): GoalPreviewProps {
	return {
		mode: input.mode,
		goal: input.goal,
	};
}

// ============================================
// Annotations Transformers
// ============================================

function toAnnotationsListProps(
	input: AnnotationsListInput
): AnnotationsListProps {
	return {
		title: input.title,
		annotations: input.annotations,
	};
}

function toAnnotationPreviewProps(
	input: AnnotationPreviewInput
): AnnotationPreviewProps {
	return {
		mode: input.mode,
		annotation: input.annotation,
	};
}

// ============================================
// Component Registry
// ============================================

export const componentRegistry: ComponentRegistry = {
	// Charts
	"line-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps("line"),
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"bar-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps("bar"),
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"area-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps("area"),
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"pie-chart": {
		validate: isDistributionInput,
		transform: toDistributionProps("pie"),
		component: DistributionRenderer,
	} as ComponentDefinition<DistributionInput, DistributionProps>,

	"donut-chart": {
		validate: isDistributionInput,
		transform: toDistributionProps("donut"),
		component: DistributionRenderer,
	} as ComponentDefinition<DistributionInput, DistributionProps>,

	// Links
	"links-list": {
		validate: isLinksListInput,
		transform: toLinksListProps,
		component: LinksListRenderer,
	} as ComponentDefinition<LinksListInput, LinksListProps>,

	"link-preview": {
		validate: isLinkPreviewInput,
		transform: toLinkPreviewProps,
		component: LinkPreviewRenderer,
	} as ComponentDefinition<LinkPreviewInput, LinkPreviewProps>,

	// Funnels
	"funnels-list": {
		validate: isFunnelsListInput,
		transform: toFunnelsListProps,
		component: FunnelsListRenderer,
	} as ComponentDefinition<FunnelsListInput, FunnelsListProps>,

	"funnel-preview": {
		validate: isFunnelPreviewInput,
		transform: toFunnelPreviewProps,
		component: FunnelPreviewRenderer,
	} as ComponentDefinition<FunnelPreviewInput, FunnelPreviewProps>,

	// Goals
	"goals-list": {
		validate: isGoalsListInput,
		transform: toGoalsListProps,
		component: GoalsListRenderer,
	} as ComponentDefinition<GoalsListInput, GoalsListProps>,

	"goal-preview": {
		validate: isGoalPreviewInput,
		transform: toGoalPreviewProps,
		component: GoalPreviewRenderer,
	} as ComponentDefinition<GoalPreviewInput, GoalPreviewProps>,

	// Annotations
	"annotations-list": {
		validate: isAnnotationsListInput,
		transform: toAnnotationsListProps,
		component: AnnotationsListRenderer,
	} as ComponentDefinition<AnnotationsListInput, AnnotationsListProps>,

	"annotation-preview": {
		validate: isAnnotationPreviewInput,
		transform: toAnnotationPreviewProps,
		component: AnnotationPreviewRenderer,
	} as ComponentDefinition<AnnotationPreviewInput, AnnotationPreviewProps>,
};

export function hasComponent(type: string): boolean {
	return type in componentRegistry;
}

export function getComponent(type: string) {
	return componentRegistry[type];
}
