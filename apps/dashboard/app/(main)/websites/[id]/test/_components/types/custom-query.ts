export type AggregateFunction =
	| "count"
	| "sum"
	| "avg"
	| "max"
	| "min"
	| "uniq";

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
