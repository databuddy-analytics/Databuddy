import { t } from 'elysia';
import { QueryBuilders } from '../query/builders';

const QUERY_BUILDER_TYPES = Object.keys(QueryBuilders) as Array<
	keyof typeof QueryBuilders
>;

export const FilterSchema = t.Object({
	field: t.String(),
	op: t.Enum({
		eq: 'eq',
		ne: 'ne',
		like: 'like',
		gt: 'gt',
		lt: 'lt',
		in: 'in',
		notIn: 'notIn',
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
			t.Literal('hourly'),
			t.Literal('daily'),
			t.Literal('hour'),
			t.Literal('day'),
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
			t.Literal('hourly'),
			t.Literal('daily'),
			t.Literal('hour'),
			t.Literal('day'),
		])
	),
	groupBy: t.Optional(t.Union([t.String(), t.Array(t.String())])),
	startDate: t.Optional(t.String()),
	endDate: t.Optional(t.String()),
	timeZone: t.Optional(t.String()),
});

export const CompileRequestSchema = t.Object({
	projectId: t.String(),
	type: t.Enum(Object.fromEntries(QUERY_BUILDER_TYPES.map((k) => [k, k]))),
	from: t.String(),
	to: t.String(),
	timeUnit: t.Optional(
		t.Enum({
			minute: 'minute',
			hour: 'hour',
			day: 'day',
			week: 'week',
			month: 'month',
		})
	),
	filters: t.Optional(t.Array(FilterSchema)),
	groupBy: t.Optional(t.Array(t.String())),
	orderBy: t.Optional(t.String()),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
	offset: t.Optional(t.Number({ minimum: 0 })),
});

export type FilterType = {
	field: string;
	op: 'eq' | 'ne' | 'like' | 'gt' | 'lt' | 'in' | 'notIn';
	value: string | number | Array<string | number>;
};

export type ParameterWithDatesType = {
	name: string;
	start_date?: string;
	end_date?: string;
	granularity?: 'hourly' | 'daily' | 'hour' | 'day';
	id?: string;
};

export type DynamicQueryRequestType = {
	id?: string;
	parameters: (string | ParameterWithDatesType)[];
	limit?: number;
	page?: number;
	filters?: FilterType[];
	granularity?: 'hourly' | 'daily' | 'hour' | 'day';
	groupBy?: string | string[];
	startDate?: string;
	endDate?: string;
	timeZone?: string;
};

export type CompileRequestType = {
	projectId: string;
	type: keyof typeof QueryBuilders;
	from: string;
	to: string;
	timeUnit?: 'minute' | 'hour' | 'day' | 'week' | 'month';
	filters?: FilterType[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
};
