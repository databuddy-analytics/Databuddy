export type Granularity = "minute" | "hour" | "day" | "week" | "month";

export type SqlExpression = string & { readonly __brand: "SqlExpression" };

export interface AliasedExpression {
	readonly alias: string;
	readonly expression: SqlExpression;
}

export type QueryFieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "json";

export interface QueryOutputField {
	description?: string;
	example?: string | number | boolean | null;
	label?: string;
	name: string;
	type: QueryFieldType;
	unit?: string;
}

export type VisualizationType =
	| "table"
	| "timeseries"
	| "bar"
	| "pie"
	| "metric"
	| "area"
	| "line";

export interface QueryBuilderMeta {
	category?: string;
	default_visualization?: VisualizationType;
	deprecated?: boolean;
	description: string;
	docs_url?: string;
	output_example?: Record<string, string | number | boolean | null>[];
	output_fields?: QueryOutputField[];
	supports_granularity?: ("hour" | "day" | "week" | "month")[];
	tags?: string[];
	title?: string;
	version?: string;
}

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
export type TimeUnit = Granularity | "hourly" | "daily";

export interface Filter {
	field: string;
	having?: boolean;
	op: FilterOperator;
	target?: string;
	value: string | number | (string | number)[];
}

export type ConfigField = string | AliasedExpression;

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
	deduplicateReferrers?: boolean;
	normalizeGeo?: boolean;
	normalizeUrls?: boolean;
	parseReferrers?: boolean;
	sessionAttribution?: boolean;
}

export interface QueryHelpers {
	sessionAttributionCTE: (timeField?: string) => string;
	sessionAttributionJoin: (alias?: string) => string;
}

export interface CustomSqlContext {
	endDate: string;
	filterConditions?: string[];
	filterParams?: Record<string, Filter["value"]>;
	filters?: Filter[];
	granularity?: TimeUnit;
	helpers?: QueryHelpers;
	limit?: number;
	offset?: number;
	orderBy?: string;
	startDate: string;
	timezone?: string;
	websiteId: string;
}

export type CustomSqlFn = (
	ctx: CustomSqlContext
) => string | { sql: string; params: Record<string, unknown> };

export interface PercentageOf {
	as?: string;
	of: string;
}

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
	noCache?: boolean;
	orderBy?: string;
	percentageOf?: PercentageOf;
	plugins?: QueryPlugins;
	publicAccess?: boolean;
	requiredFilters?: string[];
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
