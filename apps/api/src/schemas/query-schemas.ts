import { t } from 'elysia';
import { QueryBuilders } from '../query/builders';

const QUERY_BUILDER_TYPES = Object.keys(QueryBuilders) as Array<
	keyof typeof QueryBuilders
>;

// Security validation for field names
const ALLOWED_FILTER_FIELDS = [
	'path', 'referrer', 'device_type', 'country', 'region', 'city', 
	'browser_name', 'browser_version', 'os_name', 'os_version',
	'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
	'event_name', 'title', 'language', 'screen_resolution'
] as const;

export const FilterSchema = t.Object({
	field: t.Enum(Object.fromEntries(ALLOWED_FILTER_FIELDS.map((f) => [f, f]))),
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
		t.String({ maxLength: 500 }),
		t.Number({ minimum: -2147483648, maximum: 2147483647 }),
		t.Array(t.Union([
			t.String({ maxLength: 500 }),
			t.Number({ minimum: -2147483648, maximum: 2147483647 })
		]), { maxItems: 100 }),
	]),
});

export const ParameterWithDatesSchema = t.Object({
	name: t.String({ maxLength: 100, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' }),
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
	id: t.Optional(t.String({ maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' })),
});

export const DynamicQueryRequestSchema = t.Object({
	id: t.Optional(t.String({ maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' })),
	parameters: t.Array(t.Union([
		t.String({ maxLength: 100, pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$' }),
		ParameterWithDatesSchema
	]), { maxItems: 50 }),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 10000 })),
	page: t.Optional(t.Number({ minimum: 1, maximum: 10000 })),
	filters: t.Optional(t.Array(FilterSchema, { maxItems: 50 })),
	granularity: t.Optional(
		t.Union([
			t.Literal('hourly'),
			t.Literal('daily'),
			t.Literal('hour'),
			t.Literal('day'),
		])
	),
	groupBy: t.Optional(t.Enum(Object.fromEntries(ALLOWED_FILTER_FIELDS.map((f) => [f, f])))),
	startDate: t.Optional(t.String({ maxLength: 50 })),
	endDate: t.Optional(t.String({ maxLength: 50 })),
	timeZone: t.Optional(t.String({ maxLength: 100 })),
});

export const CompileRequestSchema = t.Object({
	projectId: t.String({ maxLength: 100, pattern: '^[a-zA-Z0-9_-]+$' }),
	type: t.Enum(Object.fromEntries(QUERY_BUILDER_TYPES.map((k) => [k, k]))),
	from: t.String({ maxLength: 50 }),
	to: t.String({ maxLength: 50 }),
	timeUnit: t.Optional(
		t.Enum({
			minute: 'minute',
			hour: 'hour',
			day: 'day',
			week: 'week',
			month: 'month',
		})
	),
	filters: t.Optional(t.Array(FilterSchema, { maxItems: 50 })),
	groupBy: t.Optional(
		t.Array(
			t.Enum(Object.fromEntries(ALLOWED_FILTER_FIELDS.map((f) => [f, f]))),
			{ maxItems: 20 }
		)
	),
	orderBy: t.Optional(
		t.Array(
			t.Object({
				field: t.Enum(Object.fromEntries(ALLOWED_FILTER_FIELDS.map((f) => [f, f]))),
				direction: t.Optional(t.Enum({ asc: 'asc', desc: 'desc' }))
			}),
			{ maxItems: 10 }
		)
	),
	limit: t.Optional(t.Number({ minimum: 1, maximum: 1000 })),
	offset: t.Optional(t.Number({ minimum: 0, maximum: 1000000 })),
});

export type FilterField = typeof ALLOWED_FILTER_FIELDS[number];

export type FilterType = {
	field: FilterField;
	op: 'eq' | 'ne' | 'like' | 'gt' | 'lt' | 'in' | 'notIn';
	value: string | number | Array<string | number>;
};

export type OrderByItem = {
	field: FilterField;
	direction?: 'asc' | 'desc';
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
	groupBy?: FilterField;
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
	groupBy?: FilterField[];
	orderBy?: OrderByItem[];
	limit?: number;
	offset?: number;
};
