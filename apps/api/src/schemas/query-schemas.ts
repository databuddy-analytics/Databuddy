import { t } from "elysia";
import { QueryBuilders } from "../query/builders";

const QUERY_BUILDER_TYPES = Object.keys(QueryBuilders) as Array<
	keyof typeof QueryBuilders
>;

export const DatePresets = {
	today: "today",
	yesterday: "yesterday",
	last_7d: "last_7d",
	last_14d: "last_14d",
	last_30d: "last_30d",
	last_90d: "last_90d",
	this_week: "this_week",
	last_week: "last_week",
	this_month: "this_month",
	last_month: "last_month",
	this_year: "this_year",
} as const;

export type DatePreset = keyof typeof DatePresets;

export const DatePresetSchema = t.Enum(DatePresets);

export const FilterSchema = t.Object({
	field: t.String(),
	op: t.Enum({
		eq: "eq",
		ne: "ne",
		contains: "contains",
		not_contains: "not_contains",
		starts_with: "starts_with",
		in: "in",
		not_in: "not_in",
	}),
	value: t.Union([
		t.String(),
		t.Number(),
		t.Array(t.Union([t.String(), t.Number()])),
	]),
});

export const ParameterWithDatesSchema = t.Object({
	name: t.String(),
	start_date: t.Optional(t.String()),
	end_date: t.Optional(t.String()),
	granularity: t.Optional(
		t.Union([
			t.Literal("hourly"),
			t.Literal("daily"),
			t.Literal("hour"),
			t.Literal("day"),
		])
	),
	id: t.Optional(t.String()),
});

export const DynamicQueryRequestSchema = t.Object({
	id: t.Optional(t.String()),
	parameters: t.Array(t.Union([t.String(), ParameterWithDatesSchema])),
	limit: t.Optional(t.Number()),
	page: t.Optional(t.Number()),
	filters: t.Optional(t.Array(FilterSchema)),
	granularity: t.Optional(
		t.Union([
			t.Literal("hourly"),
			t.Literal("daily"),
			t.Literal("hour"),
			t.Literal("day"),
		])
	),
	groupBy: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	startDate: t.Optional(t.String()),
	endDate: t.Optional(t.String()),
	preset: t.Optional(DatePresetSchema),
	timeZone: t.Optional(t.String()),
});

export const CompileRequestSchema = t.Object({
	projectId: t.String(),
	type: t.Enum(Object.fromEntries(QUERY_BUILDER_TYPES.map((k) => [k, k]))),
	from: t.String(),
	to: t.String(),
	timeUnit: t.Optional(
		t.Enum({
			minute: "minute",
			hour: "hour",
			day: "day",
			week: "week",
			month: "month",
		})
	),
	filters: t.Optional(t.Array(FilterSchema)),
	groupBy: t.Optional(t.Array(t.String())),
	orderBy: t.Optional(t.String()),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
	offset: t.Optional(t.Number({ minimum: 0 })),
});

export interface FilterType {
	field: string;
	op:
	| "eq"
	| "ne"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "in"
	| "not_in";
	value: string | number | Array<string | number>;
};

export interface ParameterWithDatesType {
	name: string;
	start_date?: string;
	end_date?: string;
	granularity?: "hourly" | "daily" | "hour" | "day";
	id?: string;
};

export interface DynamicQueryRequestType {
	id?: string;
	parameters: (string | ParameterWithDatesType)[];
	limit?: number;
	page?: number;
	filters?: FilterType[];
	granularity?: "hourly" | "daily" | "hour" | "day";
	groupBy?: string | string[];
	startDate?: string;
	endDate?: string;
	preset?: DatePreset;
	timeZone?: string;
};

export interface CompileRequestType {
	projectId: string;
	type: keyof typeof QueryBuilders;
	from: string;
	to: string;
	timeUnit?: "minute" | "hour" | "day" | "week" | "month";
	filters?: FilterType[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
};
