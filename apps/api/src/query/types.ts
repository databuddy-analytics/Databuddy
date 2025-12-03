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

export type Filter = {
	field: string;
	op: FilterOperator;
	value: string | number | (string | number)[];
	/** Target specific CTE or query part (e.g., 'session_attribution', 'main') */
	target?: string;
	/** Apply as HAVING clause instead of WHERE */
	having?: boolean;
};

// ============================================================================
// Field Definition Types - Declarative field building
// ============================================================================

/** Column field - direct column reference */
export type ColumnField = {
	type: "column";
	source: string;
	alias?: string;
};

/** Aggregate field - uses aggregate function */
export type AggregateField = {
	type: "aggregate";
	fn: AggregateFn;
	source?: string;
	condition?: string;
	alias: string;
};

/** Expression field - raw SQL expression */
export type ExpressionField = {
	type: "expression";
	expression: string | SqlExpression;
	alias: string;
};

/** Window field - aggregate with OVER clause */
export type WindowField = {
	type: "window";
	fn: AggregateFn;
	source?: string;
	over: {
		partitionBy?: string[];
		orderBy?: string;
	};
	alias: string;
};

/** Computed field - references pre-built computed metric */
export type ComputedField = {
	type: "computed";
	metric: "bounceRate" | "percentageOfTotal" | "pagesPerSession";
	/** Fields to use as inputs (depends on metric) */
	inputs: string[];
	alias: string;
};

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

export type CTEDefinition = {
	name: string;
	table?: string;
	from?: string; // Reference another CTE
	fields: ConfigField[];
	where?: string[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
};

// ============================================================================
// Time Bucket Configuration
// ============================================================================

export type TimeBucketConfig = {
	/** Field to bucket (defaults to timeField) */
	field?: string;
	/** Granularity (can be overridden by request.timeUnit) */
	granularity?: Granularity;
	/** Apply timezone conversion */
	timezone?: boolean;
	/** Output column name (default: 'date') */
	alias?: string;
	/** Format output as string (for hourly data) */
	format?: boolean;
};

// ============================================================================
// Query Configuration
// ============================================================================

export type QueryPlugins = {
	parseReferrers?: boolean;
	normalizeUrls?: boolean;
	normalizeGeo?: boolean;
	deduplicateGeo?: boolean;
	mapDeviceTypes?: boolean;
	sessionAttribution?: boolean;
};

export type QueryHelpers = {
	sessionAttributionCTE: (timeField?: string) => string;
	sessionAttributionJoin: (alias?: string) => string;
};

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

export type SimpleQueryConfig = {
	/** Main table to query */
	table?: string;

	/** Fields to select (legacy string[] or new ConfigField[]) */
	fields?: ConfigField[];

	/** CTEs to generate (new declarative API) */
	with?: CTEDefinition[];

	/** Override FROM clause (e.g., to reference a CTE) */
	from?: string;

	/** Static WHERE conditions */
	where?: string[];

	/** HAVING conditions for aggregate filtering */
	having?: string[];

	/** GROUP BY columns */
	groupBy?: string[];

	/** ORDER BY clause */
	orderBy?: string;

	/** Result limit */
	limit?: number;

	/** Time field for date filtering */
	timeField?: string;

	/** Time bucket configuration (new) */
	timeBucket?: TimeBucketConfig;

	/** Allowed filter fields */
	allowedFilters?: string[];

	/** Whether query supports customization */
	customizable?: boolean;

	/** Post-processing plugins */
	plugins?: QueryPlugins;

	/** Custom SQL function (escape hatch) */
	customSql?: CustomSqlFn;

	/** Append end-of-day time to 'to' date */
	appendEndOfDayToTo?: boolean;

	/** Skip automatic date filtering */
	skipDateFilter?: boolean;

	/** Query metadata for documentation */
	meta?: QueryBuilderMeta;
};

export type QueryRequest = {
	projectId: string;
	type: string;
	from: string;
	to: string;
	timeUnit?: TimeUnit;
	filters?: Filter[];
	groupBy?: string[];
	orderBy?: string;
	limit?: number;
	offset?: number;
	timezone?: string;
};

export type CompiledQuery = {
	sql: string;
	params: Record<string, unknown>;
};
