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
import { type DataTableProps, DataTableRenderer } from "./renderers/data-table";
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
import { type MiniMapProps, MiniMapRenderer } from "./renderers/mini-map";
import {
	type ReferrersListProps,
	ReferrersListRenderer,
} from "./renderers/referrers-list";
import type {
	AnnotationPreviewInput,
	AnnotationsListInput,
	ComponentDefinition,
	ComponentRegistry,
	DataTableInput,
	DistributionInput,
	FunnelPreviewInput,
	FunnelsListInput,
	GoalPreviewInput,
	GoalsListInput,
	LinkPreviewInput,
	LinksListInput,
	MiniMapInput,
	RawComponentInput,
	ReferrersListInput,
	TimeSeriesInput,
} from "./types";

function isTimeSeriesInput(
	input: RawComponentInput
): input is RawComponentInput & TimeSeriesInput {
	if (!(Array.isArray(input.series) && Array.isArray(input.rows))) {
		return false;
	}
	if (input.series.length === 0) {
		return false;
	}
	return (input.series as unknown[]).every(
		(s: unknown) => typeof s === "string"
	);
}

function isDistributionInput(
	input: RawComponentInput
): input is RawComponentInput & DistributionInput {
	if (!Array.isArray(input.rows)) {
		return false;
	}
	return input.rows.length > 0;
}

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

function isDataTableInput(
	input: RawComponentInput
): input is RawComponentInput & DataTableInput {
	if (input.type !== "data-table") {
		return false;
	}
	return Array.isArray(input.columns) && Array.isArray(input.rows);
}

function isReferrersListInput(
	input: RawComponentInput
): input is RawComponentInput & ReferrersListInput {
	if (input.type !== "referrers-list") {
		return false;
	}
	if (!Array.isArray(input.referrers)) {
		return false;
	}
	return input.referrers.every(
		(ref) =>
			typeof ref === "object" &&
			ref !== null &&
			typeof (ref as Record<string, unknown>).name === "string" &&
			typeof (ref as Record<string, unknown>).visitors === "number"
	);
}

function isMiniMapInput(
	input: RawComponentInput
): input is RawComponentInput & MiniMapInput {
	if (input.type !== "mini-map") {
		return false;
	}
	if (!Array.isArray(input.countries)) {
		return false;
	}
	return input.countries.every(
		(country) =>
			typeof country === "object" &&
			country !== null &&
			typeof (country as Record<string, unknown>).name === "string" &&
			typeof (country as Record<string, unknown>).visitors === "number"
	);
}

function toTimeSeriesProps(input: TimeSeriesInput): TimeSeriesProps {
	const series = input.series;
	const data = input.rows
		.filter(
			(row): row is [string, ...number[]] =>
				Array.isArray(row) && row.length === series.length + 1
		)
		.map(([x, ...values]) => ({
			x: String(x),
			...Object.fromEntries(
				series.map((key, i) => [key, Number(values[i]) || 0])
			),
		}));
	const variant = input.type.replace(
		"-chart",
		""
	) as TimeSeriesProps["variant"];
	return {
		variant: variant === "stacked-bar" ? "stacked-bar" : variant,
		title: input.title,
		data,
		series,
	};
}

function toDistributionProps(input: DistributionInput): DistributionProps {
	const data = input.rows
		.filter(
			(row): row is [string, number] => Array.isArray(row) && row.length >= 2
		)
		.map(([name, value]) => ({ name: String(name), value: Number(value) }));
	return {
		variant: input.type === "donut-chart" ? "donut" : "pie",
		title: input.title,
		data,
	};
}

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

function toDataTableProps(input: DataTableInput): DataTableProps {
	const alignArr = input.align ?? [];
	const columns = input.columns.map((header, i) => ({
		key: String(i),
		header: String(header),
		align: (alignArr[i] ?? "left") as "left" | "center" | "right",
	}));
	const rows = input.rows
		.filter((row) => Array.isArray(row))
		.map(
			(row) =>
				Object.fromEntries(
					input.columns.map((_, i) => [String(i), row[i] ?? null])
				) as Record<string, string | number | boolean | null>
		);
	return {
		title: input.title,
		description: input.description,
		columns,
		rows,
		footer: input.footer,
	};
}

function toReferrersListProps(input: ReferrersListInput): ReferrersListProps {
	return {
		title: input.title,
		referrers: input.referrers,
	};
}

function toMiniMapProps(input: MiniMapInput): MiniMapProps {
	return {
		title: input.title,
		countries: input.countries,
	};
}

export const componentRegistry: ComponentRegistry = {
	"line-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps,
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"bar-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps,
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"area-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps,
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"stacked-bar-chart": {
		validate: isTimeSeriesInput,
		transform: toTimeSeriesProps,
		component: TimeSeriesRenderer,
	} as ComponentDefinition<TimeSeriesInput, TimeSeriesProps>,

	"pie-chart": {
		validate: isDistributionInput,
		transform: toDistributionProps,
		component: DistributionRenderer,
	} as ComponentDefinition<DistributionInput, DistributionProps>,

	"donut-chart": {
		validate: isDistributionInput,
		transform: toDistributionProps,
		component: DistributionRenderer,
	} as ComponentDefinition<DistributionInput, DistributionProps>,

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

	"data-table": {
		validate: isDataTableInput,
		transform: toDataTableProps,
		component: DataTableRenderer,
	} as ComponentDefinition<DataTableInput, DataTableProps>,

	"referrers-list": {
		validate: isReferrersListInput,
		transform: toReferrersListProps,
		component: ReferrersListRenderer,
	} as ComponentDefinition<ReferrersListInput, ReferrersListProps>,

	"mini-map": {
		validate: isMiniMapInput,
		transform: toMiniMapProps,
		component: MiniMapRenderer,
	} as ComponentDefinition<MiniMapInput, MiniMapProps>,
};

export function hasComponent(type: string): boolean {
	return type in componentRegistry;
}

export function getComponent(type: string) {
	return componentRegistry[type];
}
