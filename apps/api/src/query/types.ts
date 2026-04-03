import type { QueryBuilderMeta } from "@databuddy/shared/types/query";
import type {
	AggregateFn,
	AliasedExpression,
	Granularity,
	SqlExpression,
} from "./expressions";

// ============================================================================
// Filter Operators
// ============================================================================

// Note: Both `contains` and `starts_with` use the LIKE operator.
// The distinction is handled by value formatting: `contains` wraps values with %...%,
// while `starts_with` appends % to the value (e.g., "value%").
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

// ============================================================================
// Filter Types
// ============================================================================

export interface Filter {
	field: string;
	/** Apply as HAVING clause instead of WHERE */
	having?: boolean;
	op: FilterOperator;
	/** Target specific CTE or query part (e.g., 'session_attribution', 'main') */
	target?: string;
	value: string | number | (string | number)[];
}

// ============================================================================
// Field Definition Types - Declarative field building
// ============================================================================

/** Column field - direct column reference */
export interface ColumnField {
	alias?: string;
	source: string;
	type: "column";
}

/** Aggregate field - uses aggregate function */
export interface AggregateField {
	alias: string;
	condition?: string;
	fn: AggregateFn;
	source?: string;
	type: "aggregate";
}

/** Expression field - raw SQL expression */
export interface ExpressionField {
	alias: string;
	expression: string | SqlExpression;
	type: "expression";
}

/** Window field - aggregate with OVER clause */
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

/** Computed field - references pre-built computed metric */
export interface ComputedField {
	alias: string;
	/** Fields to use as inputs (depends on metric) */
	inputs: string[];
	metric: "bounceRate" | "percentageOfTotal" | "pagesPerSession";
	type: "computed";
}

/** Union type for all field definitions */
export type FieldDefinition =
	| ColumnField
	| AggregateField
	| ExpressionField
	| WindowField
	| ComputedField;

/** Field that can be used in config - either string or structured */
export type ConfigField = string | FieldDefinition | AliasedExpression;

// ============================================================================
// CTE Definition Types
// ============================================================================

export interface CTEDefinition {
	fields: ConfigField[];
	from?: string; // Reference another CTE
	groupBy?: string[];
	limit?: number;
	name: string;
	orderBy?: string;
	table?: string;
	where?: string[];
}

// ============================================================================
// Time Bucket Configuration
// ============================================================================

export interface TimeBucketConfig {
	/** Output column name (default: 'date') */
	alias?: string;
	/** Field to bucket (defaults to timeField) */
	field?: string;
	/** Format output as string (for hourly data) */
	format?: boolean;
	/** Granularity (can be overridden by request.timeUnit) */
	granularity?: Granularity;
	/** Apply timezone conversion */
	timezone?: boolean;
}

// ============================================================================
// Query Configuration
// ============================================================================

export interface QueryPlugins {
	deduplicateGeo?: boolean;
	mapDeviceTypes?: boolean;
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
	/** Allowed filter fields */
	allowedFilters?: string[];

	/** Append end-of-day time to 'to' date */
	appendEndOfDayToTo?: boolean;

	/** Whether query supports customization */
	customizable?: boolean;

	/** Custom SQL function (escape hatch) */
	customSql?: CustomSqlFn;

	/** Fields to select (legacy string[] or new ConfigField[]) */
	fields?: ConfigField[];

	/** Override FROM clause (e.g., to reference a CTE) */
	from?: string;

	/** GROUP BY columns */
	groupBy?: string[];

	/** HAVING conditions for aggregate filtering */
	having?: string[];

	/** Field used for ID filtering (default: "client_id") */
	idField?: string;

	/** Result limit */
	limit?: number;

	/** Query metadata for documentation */
	meta?: QueryBuilderMeta;

	/** ORDER BY clause */
	orderBy?: string;

	/** Post-processing plugins */
	plugins?: QueryPlugins;

	/** Skip automatic date filtering */
	skipDateFilter?: boolean;
	/** Main table to query */
	table?: string;

	/** Time bucket configuration (new) */
	timeBucket?: TimeBucketConfig;

	/** Time field for date filtering */
	timeField?: string;

	/** Static WHERE conditions */
	where?: string[];

	/** CTEs to generate (new declarative API) */
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
