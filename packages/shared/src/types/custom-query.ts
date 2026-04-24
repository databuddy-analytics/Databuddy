export type AggregateFunction =
	| "count"
	| "sum"
	| "avg"
	| "max"
	| "min"
	| "uniq";

export interface AggregateFunctionInfo {
	applicableTypes: ("string" | "number" | "datetime" | "boolean" | "array")[];
	description: string;
	label: string;
	requiresColumn: boolean;
	value: AggregateFunction;
}

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

export interface OperatorInfo {
	applicableTypes: ("string" | "number" | "datetime" | "boolean")[];
	label: string;
	multiValue: boolean;
	value: CustomQueryOperator;
}

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

export interface CustomQuerySelect {
	aggregate: AggregateFunction;
	alias?: string;
	field: string;
}

export interface CustomQueryFilter {
	field: string;
	operator: CustomQueryOperator;
	value: string | number | (string | number)[];
}

export interface CustomQueryConfig {
	filters?: CustomQueryFilter[];
	groupBy?: string[];
	selects: CustomQuerySelect[];
	table: string;
}

export interface CustomQueryRequest {
	endDate: string;
	granularity?: "hourly" | "daily";
	limit?: number;
	query: CustomQueryConfig;
	startDate: string;
	timezone?: string;
}

export interface CustomQueryResponse {
	data?: Record<string, unknown>[];
	error?: string;
	meta?: {
		rowCount: number;
		executionTime: number;
	};
	success: boolean;
}

type ColumnType = "string" | "number" | "datetime" | "boolean" | "array";

export function getOperatorsForType(columnType: ColumnType): OperatorInfo[] {
	return CUSTOM_QUERY_OPERATORS.filter((op) =>
		op.applicableTypes.includes(
			columnType as "string" | "number" | "datetime" | "boolean"
		)
	);
}

export function getAggregatesForType(
	columnType: ColumnType
): AggregateFunctionInfo[] {
	return AGGREGATE_FUNCTIONS.filter((agg) =>
		agg.applicableTypes.includes(columnType)
	);
}
