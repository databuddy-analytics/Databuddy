import type { QueryBuilderMeta } from "@databuddy/shared/types/query";
import type {
	AggregateFn,
	AliasedExpression,
	Granularity,
	SqlExpression,
} from "./expressions";

// `contains` wraps values as %v%; `starts_with` appends %. Both map to LIKE.
export const FilterOperators = {
	eq: "=",
	ne: "!=",
	contains: "LIKE",
	not_contains: "NOT LIKE",
	starts_with: "LIKE",
	in: "IN",
	not_in: "NOT IN",
} as const;

export const TimeGranularity = {
	minute: "toStartOfMinute",
	hour: "toStartOfHour",
	day: "toStartOfDay",
	week: "toStartOfWeek",
	month: "toStartOfMonth",
} as const;

export type FilterOperator = keyof typeof FilterOperators;
export type TimeUnit = keyof typeof TimeGranularity | "hourly" | "daily";

export interface Filter {
	field: string;
	having?: boolean;
	op: FilterOperator;
	target?: string;
	value: string | number | (string | number)[];
}

export interface ColumnField {
	alias?: string;
	source: string;
	type: "column";
}

export interface AggregateField {
	alias: string;
	condition?: string;
	fn: AggregateFn;
	source?: string;
	type: "aggregate";
}

export interface ExpressionField {
	alias: string;
	expression: string | SqlExpression;
	type: "expression";
}

export interface WindowField {
	alias: string;
	fn: AggregateFn;
	over: {
		partitionBy?: string[];
		orderBy?: string;
	};
	source?: string;
	type: "window";
}

export interface ComputedField {
	alias: string;
	inputs: string[];
	metric: "bounceRate" | "percentageOfTotal" | "pagesPerSession";
	type: "computed";
}

export type FieldDefinition =
	| ColumnField
	| AggregateField
	| ExpressionField
	| WindowField
	| ComputedField;

export type ConfigField = string | FieldDefinition | AliasedExpression;

export interface CTEDefinition {
	fields: ConfigField[];
	from?: string;
	groupBy?: string[];
	limit?: number;
	name: string;
	orderBy?: string;
	table?: string;
	where?: string[];
}

export interface TimeBucketConfig {
	alias?: string;
	field?: string;
	format?: boolean;
	granularity?: Granularity;
	timezone?: boolean;
}

export interface QueryPlugins {
	deduplicateGeo?: boolean;
	normalizeGeo?: boolean;
	normalizeUrls?: boolean;
	parseReferrers?: boolean;
	sessionAttribution?: boolean;
}

export interface QueryHelpers {
	sessionAttributionCTE: (timeField?: string) => string;
	sessionAttributionJoin: (alias?: string) => string;
}

export type CustomSqlFn = (
	websiteId: string,
	startDate: string,
	endDate: string,
	filters?: Filter[],
	granularity?: TimeUnit,
	limit?: number,
	offset?: number,
	timezone?: string,
	filterConditions?: string[],
	filterParams?: Record<string, Filter["value"]>,
	helpers?: QueryHelpers
) => string | { sql: string; params: Record<string, unknown> };

export interface SimpleQueryConfig {
	allowedFilters?: string[];
	appendEndOfDayToTo?: boolean;
	customizable?: boolean;
	customSql?: CustomSqlFn;
	fields?: ConfigField[];
	from?: string;
	groupBy?: string[];
	having?: string[];
	idField?: string;
	limit?: number;
	meta?: QueryBuilderMeta;
	orderBy?: string;
	plugins?: QueryPlugins;
	skipDateFilter?: boolean;
	table?: string;
	timeBucket?: TimeBucketConfig;
	timeField?: string;
	where?: string[];
	with?: CTEDefinition[];
}

export interface QueryRequest {
	filters?: Filter[];
	from: string;
	groupBy?: string[];
	limit?: number;
	offset?: number;
	orderBy?: string;
	organizationWebsiteIds?: string[];
	projectId: string;
	timeUnit?: TimeUnit;
	timezone?: string;
	to: string;
	type: string;
}

export interface CompiledQuery {
	params: Record<string, unknown>;
	sql: string;
}
