/**
 * Custom Query Types
 * Defines the structure for user-built queries against ClickHouse tables
 */

/**
 * Aggregate functions supported in custom queries
 */
export type AggregateFunction =
	| "count"
	| "sum"
	| "avg"
	| "max"
	| "min"
	| "uniq";

/**
 * Aggregate function metadata for UI
 */
export interface AggregateFunctionInfo {
	/** Column types this aggregate can be applied to */
	applicableTypes: ("string" | "number" | "datetime" | "boolean" | "array")[];
	description: string;
	label: string;
	/** Whether this aggregate requires a specific column (false for count(*)) */
	requiresColumn: boolean;
	value: AggregateFunction;
}

/**
 * All available aggregate functions with metadata
 */
export const AGGREGATE_FUNCTIONS: AggregateFunctionInfo[] = [
	{
		value: "count",
		label: "Count",
		description: "Count the number of rows",
		requiresColumn: false,
		applicableTypes: ["string", "number", "datetime", "boolean", "array"],
	},
	{
		value: "uniq",
		label: "Count Unique",
		description: "Count unique values",
		requiresColumn: true,
		applicableTypes: ["string", "number", "datetime"],
	},
	{
		value: "sum",
		label: "Sum",
		description: "Sum of all values",
		requiresColumn: true,
		applicableTypes: ["number"],
	},
	{
		value: "avg",
		label: "Average",
		description: "Average of all values",
		requiresColumn: true,
		applicableTypes: ["number"],
	},
	{
		value: "max",
		label: "Maximum",
		description: "Maximum value",
		requiresColumn: true,
		applicableTypes: ["number", "datetime"],
	},
	{
		value: "min",
		label: "Minimum",
		description: "Minimum value",
		requiresColumn: true,
		applicableTypes: ["number", "datetime"],
	},
];

/**
 * Filter operators for WHERE conditions
 */
export type CustomQueryOperator =
	| "eq"
	| "ne"
	| "gt"
	| "lt"
	| "gte"
	| "lte"
	| "contains"
	| "not_contains"
	| "starts_with"
	| "in"
	| "not_in";

/**
 * Operator metadata for UI
 */
export interface OperatorInfo {
	/** Column types this operator can be applied to */
	applicableTypes: ("string" | "number" | "datetime" | "boolean")[];
	label: string;
	/** Whether this operator accepts multiple values (for IN) */
	multiValue: boolean;
	value: CustomQueryOperator;
}

/**
 * All available filter operators with metadata
 */
export const CUSTOM_QUERY_OPERATORS: OperatorInfo[] = [
	{
		value: "eq",
		label: "Equals",
		applicableTypes: ["string", "number", "datetime", "boolean"],
		multiValue: false,
	},
	{
		value: "ne",
		label: "Not equals",
		applicableTypes: ["string", "number", "datetime", "boolean"],
		multiValue: false,
	},
	{
		value: "gt",
		label: "Greater than",
		applicableTypes: ["number", "datetime"],
		multiValue: false,
	},
	{
		value: "lt",
		label: "Less than",
		applicableTypes: ["number", "datetime"],
		multiValue: false,
	},
	{
		value: "gte",
		label: "Greater or equal",
		applicableTypes: ["number", "datetime"],
		multiValue: false,
	},
	{
		value: "lte",
		label: "Less or equal",
		applicableTypes: ["number", "datetime"],
		multiValue: false,
	},
	{
		value: "contains",
		label: "Contains",
		applicableTypes: ["string"],
		multiValue: false,
	},
	{
		value: "not_contains",
		label: "Does not contain",
		applicableTypes: ["string"],
		multiValue: false,
	},
	{
		value: "starts_with",
		label: "Starts with",
		applicableTypes: ["string"],
		multiValue: false,
	},
	{
		value: "in",
		label: "Is one of",
		applicableTypes: ["string", "number"],
		multiValue: true,
	},
	{
		value: "not_in",
		label: "Is not one of",
		applicableTypes: ["string", "number"],
		multiValue: true,
	},
];

/**
 * A single SELECT expression in the query
 */
export interface CustomQuerySelect {
	/** Aggregate function to apply */
	aggregate: AggregateFunction;
	/** Display alias for the result */
	alias?: string;
	/** Field name to aggregate (use "*" for count(*)) */
	field: string;
}

/**
 * A single WHERE condition in the query
 */
export interface CustomQueryFilter {
	/** Field name to filter on */
	field: string;
	/** Comparison operator */
	operator: CustomQueryOperator;
	/** Value(s) to compare against */
	value: string | number | (string | number)[];
}

/**
 * Complete custom query configuration
 */
export interface CustomQueryConfig {
	/** WHERE conditions (AND'd together) */
	filters?: CustomQueryFilter[];
	/** GROUP BY fields for breakdown queries */
	groupBy?: string[];
	/** SELECT expressions with aggregates */
	selects: CustomQuerySelect[];
	/** Table to query */
	table: string;
}

/**
 * Request payload for custom query API
 */
export interface CustomQueryRequest {
	/** End date for time range */
	endDate: string;
	/** Granularity for time-based grouping */
	granularity?: "hourly" | "daily";
	/** Maximum rows to return */
	limit?: number;
	/** The query configuration */
	query: CustomQueryConfig;
	/** Start date for time range */
	startDate: string;
	/** Timezone for date interpretation */
	timezone?: string;
}

/**
 * Response from custom query API
 */
export interface CustomQueryResponse {
	data?: Record<string, unknown>[];
	error?: string;
	meta?: {
		rowCount: number;
		executionTime: number;
	};
	success: boolean;
}

/**
 * Get operators applicable to a column type
 */
export function getOperatorsForType(
	columnType: "string" | "number" | "datetime" | "boolean" | "array"
): OperatorInfo[] {
	return CUSTOM_QUERY_OPERATORS.filter((op) =>
		op.applicableTypes.includes(
			columnType as "string" | "number" | "datetime" | "boolean"
		)
	);
}

/**
 * Get aggregate functions applicable to a column type
 */
export function getAggregatesForType(
	columnType: "string" | "number" | "datetime" | "boolean" | "array"
): AggregateFunctionInfo[] {
	return AGGREGATE_FUNCTIONS.filter((agg) =>
		agg.applicableTypes.includes(columnType)
	);
}
