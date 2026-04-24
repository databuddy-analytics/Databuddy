export interface ParameterWithDates {
	end_date?: string;
	granularity?: "hourly" | "daily";
	id?: string;
	name: string;
	start_date?: string;
}

export interface DynamicQueryRequest {
	filters?: DynamicQueryFilter[];
	granularity?: "hourly" | "daily";
	groupBy?: string | string[];
	id?: string;
	limit?: number;
	page?: number;
	parameters: (string | ParameterWithDates)[];
}

export interface DynamicQueryFilter {
	field: string;
	operator:
		| "eq"
		| "ne"
		| "contains"
		| "not_contains"
		| "starts_with"
		| "in"
		| "not_in";
	value: string | number | (string | number)[];
}

export interface DynamicQueryResponse {
	data: {
		data: Record<string, unknown>[];
		error?: string;
		parameter: string;
		success: boolean;
	}[];
	date_range?: { start: string; end: string };
	error?: string;
	meta: {
		parameters: string[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
	queryId?: string;
	success: boolean;
}

export interface GoalFilter {
	field: string;
	operator: "equals" | "contains" | "not_equals" | "in" | "not_in";
	value: string | string[];
}

export interface BatchQueryResponse {
	batch: true;
	meta: {
		total_queries: number;
		successful_queries: number;
		failed_queries: number;
	};
	results: (DynamicQueryResponse & { queryId: string })[];
	success: boolean;
}
